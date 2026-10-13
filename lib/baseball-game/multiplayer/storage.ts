import "server-only";

import { randomUUID } from "node:crypto";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { storageFailure } from "@/lib/supabase/log";
import type { Json } from "@/lib/supabase/database.types";

import type { GameState, TeamSide } from "../types";
import type {
  SeatPresenceMap,
  SeatVisibility,
  StoredSeatPresence,
} from "./presence";
import type { MultiplayerReaction } from "./reactions";
import type { MultiplayerSeries } from "./series";
import type { MultiplayerClockState } from "./shot-clock";
import type {
  MultiplayerClockUpdateInput,
  MultiplayerCommitInput,
  MultiplayerReactionInput,
  MultiplayerRematchInput,
  MultiplayerCommitResult,
  MultiplayerRoomRecord,
  MultiplayerRoomStatus,
} from "./types";

type CreateStoredRoomInput = {
  roomCode: string;
  state: GameState;
  awayTokenHash: string;
};

export interface MultiplayerStorage {
  createRoom(input: CreateStoredRoomInput): Promise<MultiplayerRoomRecord>;
  getRoom(roomCode: string): Promise<MultiplayerRoomRecord | null>;
  getSeatContext(
    roomId: string,
    tokenHash: string,
  ): Promise<MultiplayerSeatContext>;
  touchSeat(
    roomId: string,
    tokenHash: string,
    visibility: SeatVisibility,
  ): Promise<TeamSide | null>;
  getIdempotencyRevision(
    roomId: string,
    idempotencyKey: string,
  ): Promise<number | null>;
  claimHomeSeat(roomCode: string, tokenHash: string): Promise<boolean>;
  commitAction(input: MultiplayerCommitInput): Promise<MultiplayerCommitResult>;
  updateClock(
    input: MultiplayerClockUpdateInput,
  ): Promise<"applied" | "conflict">;
  pushReaction(
    input: MultiplayerReactionInput,
  ): Promise<"applied" | "cooldown" | "conflict">;
  voteRematch(input: MultiplayerRematchInput): Promise<"applied" | "conflict">;
}

export type MultiplayerSeatContext = {
  seat: TeamSide | null;
  occupied: Record<TeamSide, boolean>;
  presence: SeatPresenceMap;
};

type MemoryRoom = MultiplayerRoomRecord & {
  seats: Partial<Record<TeamSide, string>>;
  presence: Partial<Record<TeamSide, StoredSeatPresence>>;
  idempotency: Map<string, number>;
};

const globalStore = globalThis as typeof globalThis & {
  __baseballMultiplayerRooms?: Map<string, MemoryRoom>;
};

function memoryRooms() {
  globalStore.__baseballMultiplayerRooms ??= new Map();
  return globalStore.__baseballMultiplayerRooms;
}

class MemoryMultiplayerStorage implements MultiplayerStorage {
  async createRoom(input: CreateStoredRoomInput) {
    const rooms = memoryRooms();
    if (rooms.has(input.roomCode)) throw new Error("ROOM_CODE_CONFLICT");
    const now = Date.now();
    const room: MemoryRoom = {
      id: randomUUID(),
      roomCode: input.roomCode,
      status: "lobby",
      state: structuredClone(input.state),
      revision: input.state.revision,
      revisionStartedAt: new Date(now).toISOString(),
      clock: null,
      reactions: [],
      series: null,
      expiresAt: new Date(now + ROOM_LIFETIME_MS).toISOString(),
      seats: { away: input.awayTokenHash },
      presence: { away: freshPresence("visible") },
      idempotency: new Map(),
    };
    rooms.set(room.roomCode, room);
    return cloneRoom(room);
  }

  async getRoom(roomCode: string) {
    const room = memoryRooms().get(roomCode);
    if (!room) return null;
    if (
      Date.parse(room.expiresAt) <= Date.now() &&
      room.status !== "finished"
    ) {
      room.status = "expired";
    }
    return cloneRoom(room);
  }

  async getSeatContext(
    roomId: string,
    tokenHash: string,
  ): Promise<MultiplayerSeatContext> {
    const room = findMemoryRoom(roomId);
    return {
      seat: !room
        ? null
        : room.seats.away === tokenHash
          ? "away"
          : room.seats.home === tokenHash
            ? "home"
            : null,
      occupied: {
        away: Boolean(room?.seats.away),
        home: Boolean(room?.seats.home),
      },
      presence: {
        away: room?.presence.away ? { ...room.presence.away } : null,
        home: room?.presence.home ? { ...room.presence.home } : null,
      },
    };
  }

  async touchSeat(
    roomId: string,
    tokenHash: string,
    visibility: SeatVisibility,
  ) {
    const room = findMemoryRoom(roomId);
    if (!room) return null;
    const seat =
      room.seats.away === tokenHash
        ? "away"
        : room.seats.home === tokenHash
          ? "home"
          : null;
    if (seat) room.presence[seat] = freshPresence(visibility);
    return seat;
  }

  async getIdempotencyRevision(roomId: string, idempotencyKey: string) {
    return findMemoryRoom(roomId)?.idempotency.get(idempotencyKey) ?? null;
  }

  async claimHomeSeat(roomCode: string, tokenHash: string) {
    const room = memoryRooms().get(roomCode);
    if (!room || room.status !== "lobby" || room.seats.home) return false;
    room.seats.home = tokenHash;
    room.presence.home = freshPresence("visible");
    room.status = "playing";
    room.revisionStartedAt = new Date().toISOString();
    return true;
  }

  async commitAction(
    input: MultiplayerCommitInput,
  ): Promise<MultiplayerCommitResult> {
    const room = findMemoryRoom(input.roomId);
    if (!room) return { status: "conflict" } as const;
    const duplicateRevision = room.idempotency.get(input.idempotencyKey);
    if (duplicateRevision !== undefined) {
      return { status: "duplicate", revision: duplicateRevision } as const;
    }
    if (
      room.status !== "playing" ||
      room.revision !== input.expectedRevision ||
      input.newState.revision !== input.expectedRevision + 1
    ) {
      return { status: "conflict" } as const;
    }
    room.state = structuredClone(input.newState);
    room.revision = input.newState.revision;
    room.revisionStartedAt = new Date().toISOString();
    room.clock = structuredClone(input.clock);
    room.status = input.newState.phase === "finished" ? "finished" : "playing";
    room.idempotency.set(input.idempotencyKey, room.revision);
    return { status: "applied", revision: room.revision } as const;
  }

  async updateClock(input: MultiplayerClockUpdateInput) {
    const room = findMemoryRoom(input.roomId);
    if (
      !room ||
      room.status !== "playing" ||
      room.revision !== input.revision ||
      JSON.stringify(room.clock) !== JSON.stringify(input.expectedClock)
    ) {
      return "conflict" as const;
    }
    room.clock = structuredClone(input.clock);
    if (input.finish) room.status = "finished";
    return "applied" as const;
  }

  async pushReaction(input: MultiplayerReactionInput) {
    const room = findMemoryRoom(input.roomId);
    if (!room || (room.status !== "playing" && room.status !== "finished")) {
      return "conflict" as const;
    }
    const now = Date.now();
    const recent = room.reactions.some(
      (reaction) =>
        reaction.team === input.team &&
        now - Date.parse(reaction.at) < input.cooldownMs,
    );
    if (recent) return "cooldown" as const;
    room.reactions = [
      ...room.reactions,
      {
        id: randomUUID(),
        team: input.team,
        kind: input.kind,
        at: new Date(now).toISOString(),
      },
    ].slice(-input.limit);
    return "applied" as const;
  }

  async voteRematch(input: MultiplayerRematchInput) {
    const room = findMemoryRoom(input.roomId);
    if (
      !room ||
      room.status !== "finished" ||
      room.revision !== input.revision ||
      JSON.stringify(room.series) !== JSON.stringify(input.expectedSeries)
    ) {
      return "conflict" as const;
    }
    room.series = structuredClone(input.series);
    if (!input.start) return "applied" as const;
    room.state = structuredClone(input.start.newState);
    room.revision = input.start.newState.revision;
    room.clock = structuredClone(input.start.clock);
    room.status = "playing";
    room.revisionStartedAt = new Date().toISOString();
    room.expiresAt = new Date(Date.now() + ROOM_LIFETIME_MS).toISOString();
    room.seats = { away: room.seats.home, home: room.seats.away };
    room.presence = { away: room.presence.home, home: room.presence.away };
    return "applied" as const;
  }
}

class SupabaseMultiplayerStorage implements MultiplayerStorage {
  async createRoom(input: CreateStoredRoomInput) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("baseball_games")
      .insert({
        room_code: input.roomCode,
        status: "lobby",
        state: input.state as unknown as Json,
        revision: input.state.revision,
      })
      .select(ROOM_COLUMNS)
      .single();
    if (error || !data) {
      if (error?.code === "23505") throw new Error("ROOM_CODE_CONFLICT");
      throw storageFailure("ROOM_CREATE_FAILED", error);
    }
    const { error: seatError } = await supabase
      .from("baseball_game_seats")
      .insert({
        game_id: data.id,
        team: "away",
        token_hash: input.awayTokenHash,
      });
    if (seatError) {
      await supabase.from("baseball_games").delete().eq("id", data.id);
      throw storageFailure("ROOM_SEAT_CREATE_FAILED", seatError);
    }
    return rowToRoom(data);
  }

  async getRoom(roomCode: string) {
    const { data, error } = await getSupabaseAdmin()
      .from("baseball_games")
      .select(ROOM_COLUMNS)
      .eq("room_code", roomCode)
      .maybeSingle();
    if (error) throw storageFailure("ROOM_READ_FAILED", error);
    return data ? rowToRoom(data) : null;
  }

  async getSeatContext(
    roomId: string,
    tokenHash: string,
  ): Promise<MultiplayerSeatContext> {
    const { data, error } = await getSupabaseAdmin()
      .from("baseball_game_seats")
      .select("team, token_hash, last_seen_at, visibility")
      .eq("game_id", roomId)
      .limit(2);
    if (error) throw storageFailure("ROOM_SEAT_READ_FAILED", error);
    const away = data?.find((row) => row.team === "away");
    const home = data?.find((row) => row.team === "home");
    return {
      seat:
        away?.token_hash === tokenHash
          ? "away"
          : home?.token_hash === tokenHash
            ? "home"
            : null,
      occupied: {
        away: Boolean(away),
        home: Boolean(home),
      },
      presence: {
        away: away ? rowToPresence(away) : null,
        home: home ? rowToPresence(home) : null,
      },
    };
  }

  async touchSeat(
    roomId: string,
    tokenHash: string,
    visibility: SeatVisibility,
  ) {
    const { data, error } = await getSupabaseAdmin()
      .from("baseball_game_seats")
      .update({ last_seen_at: new Date().toISOString(), visibility })
      .eq("game_id", roomId)
      .eq("token_hash", tokenHash)
      .select("team")
      .maybeSingle();
    if (error) throw storageFailure("ROOM_SEAT_TOUCH_FAILED", error);
    return data?.team === "away" || data?.team === "home" ? data.team : null;
  }

  async getIdempotencyRevision(roomId: string, idempotencyKey: string) {
    const { data, error } = await getSupabaseAdmin()
      .from("baseball_game_actions")
      .select("result_revision")
      .eq("game_id", roomId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) throw storageFailure("ROOM_ACTION_READ_FAILED", error);
    return data ? Number(data.result_revision) : null;
  }

  async claimHomeSeat(roomCode: string, tokenHash: string) {
    const { data, error } = await getSupabaseAdmin().rpc(
      "baseball_claim_home_seat",
      { p_room_code: roomCode, p_token_hash: tokenHash },
    );
    if (error) throw storageFailure("ROOM_JOIN_FAILED", error);
    return readRpcStatus(data) === "joined";
  }

  async commitAction(
    input: MultiplayerCommitInput,
  ): Promise<MultiplayerCommitResult> {
    const { data, error } = await getSupabaseAdmin().rpc(
      "baseball_commit_action",
      {
        p_game_id: input.roomId,
        p_expected_revision: input.expectedRevision,
        p_new_state: input.newState as unknown as Json,
        p_actor_team: input.actorTeam,
        p_action: input.action as unknown as Json,
        p_events: input.events as unknown as Json,
        p_idempotency_key: input.idempotencyKey,
        p_clock: input.clock as unknown as Json,
      },
    );
    if (error) throw storageFailure("ROOM_COMMIT_FAILED", error);
    const status = readRpcStatus(data);
    const revision = readRpcRevision(data);
    if ((status === "applied" || status === "duplicate") && revision !== null) {
      return { status, revision } as MultiplayerCommitResult;
    }
    return status === "invalid"
      ? { status: "invalid" }
      : { status: "conflict" };
  }

  async updateClock(input: MultiplayerClockUpdateInput) {
    const { data, error } = await getSupabaseAdmin().rpc(
      "baseball_update_clock",
      {
        p_game_id: input.roomId,
        p_revision: input.revision,
        p_expected_clock: input.expectedClock as unknown as Json,
        p_clock: input.clock as unknown as Json,
        p_finish: input.finish,
      },
    );
    if (error) throw storageFailure("ROOM_CLOCK_UPDATE_FAILED", error);
    return readRpcStatus(data) === "applied" ? "applied" : "conflict";
  }

  async pushReaction(input: MultiplayerReactionInput) {
    const { data, error } = await getSupabaseAdmin().rpc(
      "baseball_push_reaction",
      {
        p_game_id: input.roomId,
        p_team: input.team,
        p_kind: input.kind,
        p_cooldown_ms: input.cooldownMs,
        p_limit: input.limit,
      },
    );
    if (error) throw storageFailure("ROOM_REACTION_FAILED", error);
    const status = readRpcStatus(data);
    return status === "applied" || status === "cooldown" ? status : "conflict";
  }

  async voteRematch(input: MultiplayerRematchInput) {
    const { data, error } = await getSupabaseAdmin().rpc(
      "baseball_vote_rematch",
      {
        p_game_id: input.roomId,
        p_revision: input.revision,
        p_expected_series: input.expectedSeries as unknown as Json,
        p_series: input.series as unknown as Json,
        p_new_state: (input.start?.newState ?? null) as unknown as Json,
        p_clock: (input.start?.clock ?? null) as unknown as Json,
      },
    );
    if (error) throw storageFailure("ROOM_REMATCH_FAILED", error);
    return readRpcStatus(data) === "applied" ? "applied" : "conflict";
  }
}

const ROOM_LIFETIME_MS = 24 * 60 * 60 * 1000;

const ROOM_COLUMNS =
  "id, room_code, status, state, revision, revision_started_at, clock, reactions, series, expires_at";

function freshPresence(visibility: SeatVisibility): StoredSeatPresence {
  return { lastSeenAt: new Date().toISOString(), visibility };
}

function rowToPresence(row: {
  last_seen_at: string;
  visibility: string;
}): StoredSeatPresence {
  return {
    lastSeenAt: row.last_seen_at,
    visibility: row.visibility === "hidden" ? "hidden" : "visible",
  };
}

export function getMultiplayerStorage(): MultiplayerStorage {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    process.env.SUPABASE_SECRET_KEY?.trim(),
  );
  if (configured) return new SupabaseMultiplayerStorage();
  if (process.env.NODE_ENV === "production") {
    throw new Error("MULTIPLAYER_STORAGE_NOT_CONFIGURED");
  }
  return new MemoryMultiplayerStorage();
}

function findMemoryRoom(roomId: string) {
  return [...memoryRooms().values()].find((room) => room.id === roomId) ?? null;
}

function cloneRoom(room: MemoryRoom): MultiplayerRoomRecord {
  return {
    id: room.id,
    roomCode: room.roomCode,
    status: room.status,
    state: structuredClone(room.state),
    revision: room.revision,
    revisionStartedAt: room.revisionStartedAt,
    clock: room.clock ? structuredClone(room.clock) : null,
    reactions: structuredClone(room.reactions),
    series: room.series ? structuredClone(room.series) : null,
    expiresAt: room.expiresAt,
  };
}

function rowToRoom(row: {
  id: string;
  room_code: string;
  status: string;
  state: Json;
  revision: number;
  revision_started_at: string;
  clock: Json | null;
  reactions: Json;
  series: Json | null;
  expires_at: string;
}): MultiplayerRoomRecord {
  return {
    id: row.id,
    roomCode: row.room_code,
    status: row.status as MultiplayerRoomStatus,
    state: row.state as unknown as GameState,
    revision: Number(row.revision),
    revisionStartedAt: row.revision_started_at,
    clock: (row.clock ?? null) as unknown as MultiplayerClockState | null,
    reactions: Array.isArray(row.reactions)
      ? (row.reactions as unknown as MultiplayerReaction[])
      : [],
    series: (row.series ?? null) as unknown as MultiplayerSeries | null,
    expiresAt: row.expires_at,
  };
}

function readRpcStatus(value: Json) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value.status
    : null;
}

function readRpcRevision(value: Json) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return typeof value.revision === "number" ? value.revision : null;
}
