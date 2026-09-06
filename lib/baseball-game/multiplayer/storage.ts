import "server-only";

import { randomUUID } from "node:crypto";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

import type { GameState, TeamSide } from "../types";
import type {
  MultiplayerCommitInput,
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
  findSeat(roomId: string, tokenHash: string): Promise<TeamSide | null>;
  hasSeat(roomId: string, team: TeamSide): Promise<boolean>;
  getIdempotencyRevision(
    roomId: string,
    idempotencyKey: string,
  ): Promise<number | null>;
  claimHomeSeat(roomCode: string, tokenHash: string): Promise<boolean>;
  commitAction(input: MultiplayerCommitInput): Promise<MultiplayerCommitResult>;
}

type MemoryRoom = MultiplayerRoomRecord & {
  seats: Partial<Record<TeamSide, string>>;
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
      expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      seats: { away: input.awayTokenHash },
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

  async findSeat(roomId: string, tokenHash: string) {
    const room = findMemoryRoom(roomId);
    if (!room) return null;
    if (room.seats.away === tokenHash) return "away";
    if (room.seats.home === tokenHash) return "home";
    return null;
  }

  async hasSeat(roomId: string, team: TeamSide) {
    return Boolean(findMemoryRoom(roomId)?.seats[team]);
  }

  async getIdempotencyRevision(roomId: string, idempotencyKey: string) {
    return findMemoryRoom(roomId)?.idempotency.get(idempotencyKey) ?? null;
  }

  async claimHomeSeat(roomCode: string, tokenHash: string) {
    const room = memoryRooms().get(roomCode);
    if (!room || room.status !== "lobby" || room.seats.home) return false;
    room.seats.home = tokenHash;
    room.status = "playing";
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
    room.status = input.newState.phase === "finished" ? "finished" : "playing";
    room.idempotency.set(input.idempotencyKey, room.revision);
    return { status: "applied", revision: room.revision } as const;
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
      .select("id, room_code, status, state, revision, expires_at")
      .single();
    if (error || !data) {
      if (error?.code === "23505") throw new Error("ROOM_CODE_CONFLICT");
      throw new Error("ROOM_CREATE_FAILED");
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
      throw new Error("ROOM_CREATE_FAILED");
    }
    return rowToRoom(data);
  }

  async getRoom(roomCode: string) {
    const { data, error } = await getSupabaseAdmin()
      .from("baseball_games")
      .select("id, room_code, status, state, revision, expires_at")
      .eq("room_code", roomCode)
      .maybeSingle();
    if (error) throw new Error("ROOM_READ_FAILED");
    return data ? rowToRoom(data) : null;
  }

  async findSeat(roomId: string, tokenHash: string) {
    const { data, error } = await getSupabaseAdmin()
      .from("baseball_game_seats")
      .select("team")
      .eq("game_id", roomId)
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw new Error("ROOM_SEAT_READ_FAILED");
    return data?.team === "away" || data?.team === "home" ? data.team : null;
  }

  async hasSeat(roomId: string, team: TeamSide) {
    const { count, error } = await getSupabaseAdmin()
      .from("baseball_game_seats")
      .select("game_id", { count: "exact", head: true })
      .eq("game_id", roomId)
      .eq("team", team);
    if (error) throw new Error("ROOM_SEAT_READ_FAILED");
    return (count ?? 0) > 0;
  }

  async getIdempotencyRevision(roomId: string, idempotencyKey: string) {
    const { data, error } = await getSupabaseAdmin()
      .from("baseball_game_actions")
      .select("result_revision")
      .eq("game_id", roomId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) throw new Error("ROOM_ACTION_READ_FAILED");
    return data ? Number(data.result_revision) : null;
  }

  async claimHomeSeat(roomCode: string, tokenHash: string) {
    const { data, error } = await getSupabaseAdmin().rpc(
      "baseball_claim_home_seat",
      { p_room_code: roomCode, p_token_hash: tokenHash },
    );
    if (error) throw new Error("ROOM_JOIN_FAILED");
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
      },
    );
    if (error) throw new Error("ROOM_COMMIT_FAILED");
    const status = readRpcStatus(data);
    const revision = readRpcRevision(data);
    if ((status === "applied" || status === "duplicate") && revision !== null) {
      return { status, revision } as MultiplayerCommitResult;
    }
    return status === "invalid"
      ? { status: "invalid" }
      : { status: "conflict" };
  }
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
    expiresAt: room.expiresAt,
  };
}

function rowToRoom(row: {
  id: string;
  room_code: string;
  status: string;
  state: Json;
  revision: number;
  expires_at: string;
}): MultiplayerRoomRecord {
  return {
    id: row.id,
    roomCode: row.room_code,
    status: row.status as MultiplayerRoomStatus,
    state: row.state as unknown as GameState,
    revision: Number(row.revision),
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
