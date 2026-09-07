import "server-only";

import { randomInt } from "node:crypto";

import {
  createGame,
  getActionOwner,
  getGameView,
  getLegalCards,
  transition,
} from "../engine";
import type { GameConfig, TeamSide } from "../types";
import { commandToGameAction } from "./command";
import {
  newRoomCode,
  newSeatToken,
  normalizeRoomCode,
  seatTokenHash,
} from "./security";
import { getMultiplayerStorage, type MultiplayerStorage } from "./storage";
import type {
  MultiplayerCommand,
  MultiplayerCreateResult,
  MultiplayerRoomRecord,
  MultiplayerRoomSnapshot,
} from "./types";

export class MultiplayerServiceError extends Error {
  constructor(
    public readonly code:
      | "ROOM_NOT_FOUND"
      | "ROOM_UNAVAILABLE"
      | "ROOM_FULL"
      | "SEAT_REQUIRED"
      | "NOT_YOUR_TURN"
      | "INVALID_ACTION"
      | "REVISION_CONFLICT"
      | "STORAGE_ERROR",
    message: string,
  ) {
    super(message);
  }
}

export async function createMultiplayerRoom(
  config: GameConfig,
  storage: MultiplayerStorage = getMultiplayerStorage(),
): Promise<MultiplayerCreateResult> {
  const seatToken = newSeatToken();
  const state = createGame(config, { seed: randomInt(0, 0x1_0000_0000) });
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const room = await storage.createRoom({
        roomCode: newRoomCode(),
        state,
        awayTokenHash: seatTokenHash(seatToken),
      });
      return { room, seatToken };
    } catch (error) {
      if (error instanceof Error && error.message === "ROOM_CODE_CONFLICT") {
        continue;
      }
      throw new MultiplayerServiceError(
        "STORAGE_ERROR",
        "멀티플레이 방을 만들지 못했습니다.",
      );
    }
  }
  throw new MultiplayerServiceError(
    "STORAGE_ERROR",
    "사용할 수 있는 방 코드를 만들지 못했습니다.",
  );
}

export async function joinMultiplayerRoom(
  roomCode: string,
  storage: MultiplayerStorage = getMultiplayerStorage(),
) {
  const normalized = normalizeRoomCode(roomCode);
  const room = await storage.getRoom(normalized);
  if (!room) {
    throw new MultiplayerServiceError(
      "ROOM_NOT_FOUND",
      "방을 찾을 수 없습니다.",
    );
  }
  if (Date.parse(room.expiresAt) <= Date.now()) {
    throw new MultiplayerServiceError("ROOM_UNAVAILABLE", "만료된 방입니다.");
  }
  if (room.status !== "lobby") {
    throw new MultiplayerServiceError(
      room.status === "playing" || room.status === "finished"
        ? "ROOM_FULL"
        : "ROOM_UNAVAILABLE",
      room.status === "expired"
        ? "만료된 방입니다."
        : "이미 두 팀이 참가한 방입니다.",
    );
  }
  const seatToken = newSeatToken();
  let joined = false;
  try {
    joined = await storage.claimHomeSeat(normalized, seatTokenHash(seatToken));
  } catch {
    throw new MultiplayerServiceError(
      "STORAGE_ERROR",
      "방 참가 상태를 저장하지 못했습니다.",
    );
  }
  if (!joined) {
    throw new MultiplayerServiceError(
      "ROOM_FULL",
      "이미 참가자가 있는 방입니다.",
    );
  }
  return { seatToken };
}

export async function getMultiplayerSnapshot(
  roomCode: string,
  seatToken: string | null,
  storage: MultiplayerStorage = getMultiplayerStorage(),
): Promise<MultiplayerRoomSnapshot> {
  const room = await requireRoom(roomCode, storage);
  const seat = await requireSeat(room, seatToken, storage);
  return buildSnapshot(room, seat, storage);
}

export async function submitMultiplayerCommand(
  roomCode: string,
  seatToken: string | null,
  input: {
    command: MultiplayerCommand;
    expectedRevision: number;
    idempotencyKey: string;
  },
  storage: MultiplayerStorage = getMultiplayerStorage(),
): Promise<MultiplayerRoomSnapshot> {
  const room = await requireRoom(roomCode, storage);
  const seat = await requireSeat(room, seatToken, storage);
  if (room.status !== "playing") {
    throw new MultiplayerServiceError(
      "ROOM_UNAVAILABLE",
      room.status === "lobby"
        ? "상대 팀이 참가할 때까지 기다려 주세요."
        : "진행 중인 경기가 아닙니다.",
    );
  }
  if (room.revision !== input.expectedRevision) {
    const duplicateRevision = await storage.getIdempotencyRevision(
      room.id,
      input.idempotencyKey,
    );
    if (duplicateRevision !== null) {
      return buildSnapshot(room, seat, storage);
    }
    throw new MultiplayerServiceError(
      "REVISION_CONFLICT",
      "다른 기기에서 경기가 먼저 진행되었습니다.",
    );
  }
  if (getActionOwner(room.state) !== seat) {
    throw new MultiplayerServiceError(
      "NOT_YOUR_TURN",
      "상대 팀의 결정 차례입니다.",
    );
  }

  const action = commandToGameAction(room.state, input.command);
  if (!action) {
    throw new MultiplayerServiceError(
      "INVALID_ACTION",
      "현재 단계에서는 주사위를 굴릴 수 없습니다.",
    );
  }
  const result = transition(room.state, action);
  if (!result.ok) {
    throw new MultiplayerServiceError("INVALID_ACTION", result.error.message);
  }

  let commit;
  try {
    commit = await storage.commitAction({
      roomId: room.id,
      expectedRevision: input.expectedRevision,
      newState: result.state,
      actorTeam: seat,
      action,
      events: result.events,
      idempotencyKey: input.idempotencyKey,
    });
  } catch {
    throw new MultiplayerServiceError(
      "STORAGE_ERROR",
      "경기 진행을 저장하지 못했습니다.",
    );
  }
  if (commit.status === "conflict") {
    throw new MultiplayerServiceError(
      "REVISION_CONFLICT",
      "다른 기기에서 경기가 먼저 진행되었습니다.",
    );
  }
  if (commit.status === "invalid") {
    throw new MultiplayerServiceError(
      "INVALID_ACTION",
      "저장할 수 없는 경기 행동입니다.",
    );
  }

  const latest = await requireRoom(roomCode, storage);
  return buildSnapshot(latest, seat, storage);
}

async function requireRoom(roomCode: string, storage: MultiplayerStorage) {
  let room;
  try {
    room = await storage.getRoom(normalizeRoomCode(roomCode));
  } catch {
    throw new MultiplayerServiceError(
      "STORAGE_ERROR",
      "멀티플레이 방을 불러오지 못했습니다.",
    );
  }
  if (!room) {
    throw new MultiplayerServiceError(
      "ROOM_NOT_FOUND",
      "방을 찾을 수 없습니다.",
    );
  }
  if (room.status === "expired" || Date.parse(room.expiresAt) <= Date.now()) {
    throw new MultiplayerServiceError("ROOM_UNAVAILABLE", "만료된 방입니다.");
  }
  return room;
}

async function requireSeat(
  room: MultiplayerRoomRecord,
  seatToken: string | null,
  storage: MultiplayerStorage,
) {
  if (!seatToken) {
    throw new MultiplayerServiceError(
      "SEAT_REQUIRED",
      "이 기기는 아직 경기에 참가하지 않았습니다.",
    );
  }
  const seat = await storage.findSeat(room.id, seatTokenHash(seatToken));
  if (!seat) {
    throw new MultiplayerServiceError(
      "SEAT_REQUIRED",
      "유효한 참가 좌석이 없습니다.",
    );
  }
  return seat;
}

async function buildSnapshot(
  room: MultiplayerRoomRecord,
  seat: TeamSide,
  storage: MultiplayerStorage,
): Promise<MultiplayerRoomSnapshot> {
  const opponent = seat === "away" ? "home" : "away";
  const actionOwner = getActionOwner(room.state);
  return {
    roomCode: room.roomCode,
    status: room.status,
    seat,
    opponentConnected: await storage.hasSeat(room.id, opponent),
    actionOwner,
    isYourTurn: actionOwner === seat,
    legalCards:
      actionOwner === seat && room.state.phase === "awaiting_card"
        ? getLegalCards(room.state)
        : [],
    view: getGameView(room.state, seat),
  };
}
