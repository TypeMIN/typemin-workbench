import "server-only";

import { randomUUID } from "node:crypto";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

import type { GameState, TeamSide } from "../types";
import type {
  PartyActionCommitInput,
  PartyCommitResult,
  PartyMutationCommitInput,
  PartyRoomRecord,
  PartyRoomStatus,
  PartySessionState,
  PartyStoredPlayer,
} from "./types";

type CreateRoomInput = {
  roomCode: string;
  state: GameState;
  hostTokenHash: string;
  partyState: PartySessionState;
};

type JoinPlayerInput = {
  roomCode: string;
  nickname: string;
  team: TeamSide;
  tokenHash: string;
  expectedRoomRevision: number;
};

type HostMutationInput = PartyMutationCommitInput & {
  playerOperation?:
    | { type: "move"; playerId: string; team: TeamSide }
    | { type: "remove"; playerId: string }
    | null;
};

export interface PartyStorage {
  createRoom(input: CreateRoomInput): Promise<PartyRoomRecord>;
  getRoom(roomCode: string): Promise<PartyRoomRecord | null>;
  listPlayers(roomId: string): Promise<PartyStoredPlayer[]>;
  findPlayer(
    roomId: string,
    tokenHash: string,
  ): Promise<PartyStoredPlayer | null>;
  joinPlayer(
    input: JoinPlayerInput,
  ): Promise<{ playerId: string; roomRevision: number } | null>;
  heartbeat(roomId: string, playerId: string): Promise<boolean>;
  commitHostMutation(input: HostMutationInput): Promise<PartyCommitResult>;
  commitAction(input: PartyActionCommitInput): Promise<PartyCommitResult>;
  getIdempotency(
    roomId: string,
    key: string,
  ): Promise<PartyCommitResult | null>;
}

type MemoryPartyRoom = PartyRoomRecord & {
  players: PartyStoredPlayer[];
  idempotency: Map<string, PartyCommitResult>;
};

const globalStore = globalThis as typeof globalThis & {
  __baseballPartyRooms?: Map<string, MemoryPartyRoom>;
};

function memoryRooms() {
  globalStore.__baseballPartyRooms ??= new Map();
  return globalStore.__baseballPartyRooms;
}

export function resetPartyMemoryStorage() {
  memoryRooms().clear();
}

export class MemoryPartyStorage implements PartyStorage {
  async createRoom(input: CreateRoomInput) {
    if (memoryRooms().has(input.roomCode))
      throw new Error("ROOM_CODE_CONFLICT");
    const room: MemoryPartyRoom = {
      id: randomUUID(),
      roomCode: input.roomCode,
      status: "lobby",
      state: structuredClone(input.state),
      revision: input.state.revision,
      roomRevision: 0,
      hostTokenHash: input.hostTokenHash,
      partyState: structuredClone(input.partyState),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      players: [],
      idempotency: new Map(),
    };
    memoryRooms().set(room.roomCode, room);
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

  async listPlayers(roomId: string) {
    return (findRoom(roomId)?.players ?? []).map((player) => ({ ...player }));
  }

  async findPlayer(roomId: string, tokenHash: string) {
    const player = findRoom(roomId)?.players.find(
      (candidate) => candidate.tokenHash === tokenHash && !candidate.removedAt,
    );
    return player ? { ...player } : null;
  }

  async joinPlayer(input: JoinPlayerInput) {
    const room = memoryRooms().get(input.roomCode);
    if (
      !room ||
      room.status !== "lobby" ||
      room.roomRevision !== input.expectedRoomRevision
    ) {
      return null;
    }
    const active = room.players.filter((player) => !player.removedAt);
    if (
      active.filter((player) => player.team === input.team).length >= 8 ||
      active.some(
        (player) =>
          player.nickname.toLocaleLowerCase("ko-KR") ===
          input.nickname.toLocaleLowerCase("ko-KR"),
      )
    ) {
      return null;
    }
    const player: PartyStoredPlayer = {
      id: randomUUID(),
      nickname: input.nickname,
      team: input.team,
      tokenHash: input.tokenHash,
      joinedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      removedAt: null,
    };
    room.players.push(player);
    room.roomRevision += 1;
    return { playerId: player.id, roomRevision: room.roomRevision };
  }

  async heartbeat(roomId: string, playerId: string) {
    const player = findRoom(roomId)?.players.find(
      (candidate) => candidate.id === playerId && !candidate.removedAt,
    );
    if (!player) return false;
    player.lastSeenAt = new Date().toISOString();
    return true;
  }

  async commitHostMutation(input: HostMutationInput) {
    const room = findRoom(input.roomId);
    if (!room || room.roomRevision !== input.expectedRoomRevision) {
      return { status: "conflict" } as const;
    }
    if (input.playerOperation?.type === "move") {
      const operation = input.playerOperation;
      const player = room.players.find(
        (candidate) =>
          candidate.id === operation.playerId && !candidate.removedAt,
      );
      if (!player) return { status: "invalid" } as const;
      if (
        room.players.filter(
          (candidate) =>
            !candidate.removedAt && candidate.team === operation.team,
        ).length >= 8
      ) {
        return { status: "invalid" } as const;
      }
      player.team = operation.team;
    }
    if (input.playerOperation?.type === "remove") {
      const operation = input.playerOperation;
      const player = room.players.find(
        (candidate) =>
          candidate.id === operation.playerId && !candidate.removedAt,
      );
      if (!player) return { status: "invalid" } as const;
      player.removedAt = new Date().toISOString();
    }
    room.status = input.status;
    room.state = structuredClone(input.state);
    room.revision = input.state.revision;
    room.partyState = structuredClone(input.partyState);
    room.roomRevision += 1;
    return {
      status: "applied",
      revision: room.revision,
      roomRevision: room.roomRevision,
    } as const;
  }

  async commitAction(input: PartyActionCommitInput) {
    const room = findRoom(input.roomId);
    const duplicate = room?.idempotency.get(input.idempotencyKey);
    if (duplicate) return duplicate;
    if (
      !room ||
      room.status !== "playing" ||
      room.revision !== input.expectedRevision ||
      room.roomRevision !== input.expectedRoomRevision ||
      input.newState.revision !== input.expectedRevision + 1
    ) {
      return { status: "conflict" } as const;
    }
    room.state = structuredClone(input.newState);
    room.revision = input.newState.revision;
    room.partyState = structuredClone(input.newPartyState);
    room.status = input.newState.phase === "finished" ? "finished" : "playing";
    room.roomRevision += 1;
    const result = {
      status: "applied",
      revision: room.revision,
      roomRevision: room.roomRevision,
    } as const;
    room.idempotency.set(input.idempotencyKey, result);
    return result;
  }

  async getIdempotency(
    roomId: string,
    key: string,
  ): Promise<PartyCommitResult | null> {
    return findRoom(roomId)?.idempotency.get(key) ?? null;
  }
}

class SupabasePartyStorage implements PartyStorage {
  async createRoom(input: CreateRoomInput) {
    const { data, error } = await getSupabaseAdmin()
      .from("baseball_games")
      .insert({
        room_code: input.roomCode,
        status: "lobby",
        state: input.state as unknown as Json,
        revision: input.state.revision,
        mode: "party",
        host_token_hash: input.hostTokenHash,
        room_revision: 0,
        party_state: input.partyState as unknown as Json,
      })
      .select(
        "id, room_code, status, state, revision, room_revision, host_token_hash, party_state, expires_at",
      )
      .single();
    if (error || !data) {
      if (error?.code === "23505") throw new Error("ROOM_CODE_CONFLICT");
      throw new Error("ROOM_CREATE_FAILED");
    }
    return rowToRoom(data);
  }

  async getRoom(roomCode: string) {
    const { data, error } = await getSupabaseAdmin()
      .from("baseball_games")
      .select(
        "id, room_code, status, state, revision, room_revision, host_token_hash, party_state, expires_at",
      )
      .eq("room_code", roomCode)
      .eq("mode", "party")
      .maybeSingle();
    if (error) throw new Error("ROOM_READ_FAILED");
    return data ? rowToRoom(data) : null;
  }

  async listPlayers(roomId: string) {
    const { data, error } = await getSupabaseAdmin()
      .from("baseball_party_players")
      .select(
        "id, nickname, team, token_hash, joined_at, last_seen_at, removed_at",
      )
      .eq("game_id", roomId)
      .order("joined_at");
    if (error) throw new Error("PARTY_PLAYER_READ_FAILED");
    return (data ?? []).map(rowToPlayer);
  }

  async findPlayer(roomId: string, tokenHash: string) {
    const { data, error } = await getSupabaseAdmin()
      .from("baseball_party_players")
      .select(
        "id, nickname, team, token_hash, joined_at, last_seen_at, removed_at",
      )
      .eq("game_id", roomId)
      .eq("token_hash", tokenHash)
      .is("removed_at", null)
      .maybeSingle();
    if (error) throw new Error("PARTY_PLAYER_READ_FAILED");
    return data ? rowToPlayer(data) : null;
  }

  async joinPlayer(input: JoinPlayerInput) {
    const { data, error } = await getSupabaseAdmin().rpc(
      "baseball_party_join",
      {
        p_room_code: input.roomCode,
        p_nickname: input.nickname,
        p_team: input.team,
        p_token_hash: input.tokenHash,
        p_expected_room_revision: input.expectedRoomRevision,
      },
    );
    if (error) throw new Error("PARTY_JOIN_FAILED");
    const result = readRpc(data);
    return result.status === "joined" && typeof result.player_id === "string"
      ? {
          playerId: result.player_id,
          roomRevision: Number(result.room_revision),
        }
      : null;
  }

  async heartbeat(roomId: string, playerId: string) {
    const { data, error } = await getSupabaseAdmin().rpc(
      "baseball_party_heartbeat",
      {
        p_game_id: roomId,
        p_player_id: playerId,
      },
    );
    if (error) throw new Error("PARTY_HEARTBEAT_FAILED");
    return data === true;
  }

  async commitHostMutation(input: HostMutationInput) {
    const { data, error } = await getSupabaseAdmin().rpc(
      "baseball_party_host_mutation",
      {
        p_game_id: input.roomId,
        p_expected_room_revision: input.expectedRoomRevision,
        p_status: input.status,
        p_state: input.state as unknown as Json,
        p_party_state: input.partyState as unknown as Json,
        p_event_type: input.eventType,
        p_player_operation: (input.playerOperation ?? null) as unknown as Json,
        p_payload: (input.payload ?? {}) as unknown as Json,
      },
    );
    if (error) throw new Error("PARTY_HOST_COMMIT_FAILED");
    return rpcToCommit(data);
  }

  async commitAction(input: PartyActionCommitInput) {
    const { data, error } = await getSupabaseAdmin().rpc(
      "baseball_party_commit_action",
      {
        p_game_id: input.roomId,
        p_expected_revision: input.expectedRevision,
        p_expected_room_revision: input.expectedRoomRevision,
        p_new_state: input.newState as unknown as Json,
        p_party_state: input.newPartyState as unknown as Json,
        p_actor_team: input.actorTeam,
        p_actor_player_id: input.actorPlayerId,
        p_action: input.action as unknown as Json,
        p_events: input.events as unknown as Json,
        p_idempotency_key: input.idempotencyKey,
      },
    );
    if (error) throw new Error("PARTY_ACTION_COMMIT_FAILED");
    return rpcToCommit(data);
  }

  async getIdempotency(roomId: string, key: string) {
    const { data, error } = await getSupabaseAdmin()
      .from("baseball_game_actions")
      .select("result_revision, room_revision")
      .eq("game_id", roomId)
      .eq("idempotency_key", key)
      .maybeSingle();
    if (error) throw new Error("PARTY_ACTION_READ_FAILED");
    return data
      ? {
          status: "duplicate" as const,
          revision: Number(data.result_revision),
          roomRevision: Number(data.room_revision),
        }
      : null;
  }
}

export function getPartyStorage(): PartyStorage {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    process.env.SUPABASE_SECRET_KEY?.trim(),
  );
  if (configured) return new SupabasePartyStorage();
  if (process.env.NODE_ENV === "production") {
    throw new Error("PARTY_STORAGE_NOT_CONFIGURED");
  }
  return new MemoryPartyStorage();
}

function findRoom(roomId: string) {
  return [...memoryRooms().values()].find((room) => room.id === roomId) ?? null;
}

function cloneRoom(room: MemoryPartyRoom): PartyRoomRecord {
  return {
    id: room.id,
    roomCode: room.roomCode,
    status: room.status,
    state: structuredClone(room.state),
    revision: room.revision,
    roomRevision: room.roomRevision,
    hostTokenHash: room.hostTokenHash,
    partyState: structuredClone(room.partyState),
    expiresAt: room.expiresAt,
  };
}

function rowToRoom(row: {
  id: string;
  room_code: string;
  status: string;
  state: Json;
  revision: number;
  room_revision: number;
  host_token_hash: string | null;
  party_state: Json | null;
  expires_at: string;
}): PartyRoomRecord {
  return {
    id: row.id,
    roomCode: row.room_code,
    status: row.status as PartyRoomStatus,
    state: row.state as unknown as GameState,
    revision: Number(row.revision),
    roomRevision: Number(row.room_revision),
    hostTokenHash: row.host_token_hash ?? "",
    partyState: row.party_state as unknown as PartySessionState,
    expiresAt: row.expires_at,
  };
}

function rowToPlayer(row: {
  id: string;
  nickname: string;
  team: string;
  token_hash: string;
  joined_at: string;
  last_seen_at: string;
  removed_at: string | null;
}): PartyStoredPlayer {
  return {
    id: row.id,
    nickname: row.nickname,
    team: row.team as TeamSide,
    tokenHash: row.token_hash,
    joinedAt: row.joined_at,
    lastSeenAt: row.last_seen_at,
    removedAt: row.removed_at,
  };
}

function readRpc(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function rpcToCommit(value: Json): PartyCommitResult {
  const result = readRpc(value);
  if (result.status === "applied" || result.status === "duplicate") {
    return {
      status: result.status,
      revision: Number(result.revision),
      roomRevision: Number(result.room_revision),
    };
  }
  return result.status === "invalid"
    ? { status: "invalid" }
    : { status: "conflict" };
}
