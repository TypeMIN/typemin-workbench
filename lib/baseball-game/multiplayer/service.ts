import "server-only";

import { createHash, randomInt } from "node:crypto";

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
  getOpponentStatus,
  getSeatPresence,
  type SeatVisibility,
} from "./presence";
import {
  newRoomCode,
  newSeatToken,
  normalizeRoomCode,
  seatTokenHash,
} from "./security";
import {
  RECONNECT_GRACE_MS,
  TIMEOUT_EXTENSION_MS,
  buildShotClockView,
  canClaimForfeit,
  chooseTimeoutAction,
  getClockWindow,
  nextClockAfterCommit,
  resolveClockState,
  type MultiplayerClockState,
} from "./shot-clock";
import {
  getMultiplayerStorage,
  type MultiplayerSeatContext,
  type MultiplayerStorage,
} from "./storage";
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
  const storedRoom = await requireRoom(roomCode, storage);
  const seatContext = await requireSeatContext(storedRoom, seatToken, storage);
  const room = await settleExpiredDecision(storedRoom, seatContext, storage);
  return buildSnapshot(room, seatContext);
}

export async function heartbeatMultiplayerSeat(
  roomCode: string,
  seatToken: string | null,
  visibility: SeatVisibility,
  storage: MultiplayerStorage = getMultiplayerStorage(),
) {
  const room = await requireRoom(roomCode, storage);
  if (!seatToken) {
    throw new MultiplayerServiceError(
      "SEAT_REQUIRED",
      "이 기기는 아직 경기에 참가하지 않았습니다.",
    );
  }
  let seat;
  try {
    seat = await storage.touchSeat(
      room.id,
      seatTokenHash(seatToken),
      visibility,
    );
  } catch {
    throw new MultiplayerServiceError(
      "STORAGE_ERROR",
      "접속 상태를 저장하지 못했습니다.",
    );
  }
  if (!seat) {
    throw new MultiplayerServiceError(
      "SEAT_REQUIRED",
      "유효한 참가 좌석이 없습니다.",
    );
  }
  const seatContext = await requireSeatContext(room, seatToken, storage);
  await settleExpiredDecision(room, seatContext, storage);
  return { seat };
}

export async function callMultiplayerTimeout(
  roomCode: string,
  seatToken: string | null,
  expectedRevision: number,
  storage: MultiplayerStorage = getMultiplayerStorage(),
) {
  const { room, seatContext, clock } = await loadPlayingRoom(
    roomCode,
    seatToken,
    storage,
  );
  const seat = seatContext.seat;
  if (room.revision !== expectedRevision) {
    throw new MultiplayerServiceError(
      "REVISION_CONFLICT",
      "다른 기기에서 경기가 먼저 진행되었습니다.",
    );
  }
  if (getActionOwner(room.state) !== seat) {
    throw new MultiplayerServiceError(
      "NOT_YOUR_TURN",
      "작전 타임은 내 결정 차례에만 부를 수 있습니다.",
    );
  }
  if (clock.timeoutsRemaining[seat] <= 0) {
    throw new MultiplayerServiceError(
      "INVALID_ACTION",
      "남은 작전 타임이 없습니다.",
    );
  }
  const next: MultiplayerClockState = {
    ...clock,
    extensionMs: clock.extensionMs + TIMEOUT_EXTENSION_MS,
    timeoutsRemaining: {
      ...clock.timeoutsRemaining,
      [seat]: clock.timeoutsRemaining[seat] - 1,
    },
  };
  await writeClock(room, next, false, storage);
  return buildSnapshot({ ...room, clock: next }, seatContext);
}

export async function claimMultiplayerForfeit(
  roomCode: string,
  seatToken: string | null,
  storage: MultiplayerStorage = getMultiplayerStorage(),
) {
  const { room, seatContext, clock } = await loadPlayingRoom(
    roomCode,
    seatToken,
    storage,
  );
  const seat = seatContext.seat;
  if (!canClaimForfeit(clock, seat)) {
    throw new MultiplayerServiceError(
      "INVALID_ACTION",
      "아직 몰수승을 선언할 수 없습니다.",
    );
  }
  const next: MultiplayerClockState = {
    ...clock,
    forfeitedBy: oppositeSeat(seat),
  };
  await writeClock(room, next, true, storage);
  return buildSnapshot(
    { ...room, status: "finished", clock: next },
    seatContext,
  );
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
  const storedRoom = await requireRoom(roomCode, storage);
  const seatContext = await requireSeatContext(storedRoom, seatToken, storage);
  const room = await settleExpiredDecision(storedRoom, seatContext, storage);
  const seat = seatContext.seat;
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
      return buildSnapshot(room, seatContext);
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
      "현재 단계에서는 이 결정을 내릴 수 없습니다.",
    );
  }
  const result = transition(room.state, action);
  if (!result.ok) {
    throw new MultiplayerServiceError("INVALID_ACTION", result.error.message);
  }

  const clock = nextClockAfterCommit(
    resolveClockState(room.clock, room.revision),
    { actor: seat, newRevision: result.state.revision, timedOut: false },
  );
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
      clock,
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

  return buildSnapshot(
    {
      ...room,
      status: result.state.phase === "finished" ? "finished" : "playing",
      state: result.state,
      revision: result.state.revision,
      revisionStartedAt: new Date().toISOString(),
      clock,
    },
    seatContext,
  );
}

async function loadPlayingRoom(
  roomCode: string,
  seatToken: string | null,
  storage: MultiplayerStorage,
) {
  const storedRoom = await requireRoom(roomCode, storage);
  const seatContext = await requireSeatContext(storedRoom, seatToken, storage);
  const room = await settleExpiredDecision(storedRoom, seatContext, storage);
  const clock = resolveClockState(room.clock, room.revision);
  if (room.status !== "playing" || clock.forfeitedBy) {
    throw new MultiplayerServiceError(
      "ROOM_UNAVAILABLE",
      "진행 중인 경기가 아닙니다.",
    );
  }
  return { room, seatContext, clock };
}

async function writeClock(
  room: MultiplayerRoomRecord,
  clock: MultiplayerClockState,
  finish: boolean,
  storage: MultiplayerStorage,
) {
  let status;
  try {
    status = await storage.updateClock({
      roomId: room.id,
      revision: room.revision,
      expectedClock: room.clock,
      clock,
      finish,
    });
  } catch {
    throw new MultiplayerServiceError(
      "STORAGE_ERROR",
      "경기 시계를 저장하지 못했습니다.",
    );
  }
  if (status === "conflict") {
    throw new MultiplayerServiceError(
      "REVISION_CONFLICT",
      "다른 기기에서 경기가 먼저 진행되었습니다.",
    );
  }
}

/**
 * Expired decisions are resolved lazily by whichever device asks first.
 * The timeout idempotency key is derived from the revision, so concurrent
 * detections from both devices commit at most one automatic action.
 */
async function settleExpiredDecision(
  room: MultiplayerRoomRecord,
  seatContext: SeatContext,
  storage: MultiplayerStorage,
  now = Date.now(),
): Promise<MultiplayerRoomRecord> {
  if (room.status !== "playing") return room;
  const clock = resolveClockState(room.clock, room.revision);
  if (clock.forfeitedBy) return room;
  const window = getClockWindow(room.state, room.revisionStartedAt, clock);
  if (!window || now < window.deadlineAt) return room;

  try {
    const ownerSeat = seatContext.presence[window.owner];
    const ownerOffline =
      !ownerSeat || getSeatPresence(ownerSeat, now) === "offline";
    if (ownerOffline && !clock.graceUsed) {
      const next: MultiplayerClockState = {
        ...clock,
        graceUsed: true,
        extensionMs: clock.extensionMs + RECONNECT_GRACE_MS,
      };
      const status = await storage.updateClock({
        roomId: room.id,
        revision: room.revision,
        expectedClock: room.clock,
        clock: next,
        finish: false,
      });
      return status === "applied"
        ? { ...room, clock: next }
        : await reloadRoom(room, storage);
    }

    const action = chooseTimeoutAction(room.state, (size) =>
      randomInt(0, size),
    );
    if (!action) return room;
    const result = transition(room.state, action);
    if (!result.ok) return room;
    await storage.commitAction({
      roomId: room.id,
      expectedRevision: room.revision,
      newState: result.state,
      actorTeam: window.owner,
      action,
      events: result.events,
      idempotencyKey: timeoutIdempotencyKey(room.id, room.revision),
      clock: nextClockAfterCommit(clock, {
        actor: window.owner,
        newRevision: result.state.revision,
        timedOut: true,
      }),
    });
    return await reloadRoom(room, storage);
  } catch {
    return room;
  }
}

async function reloadRoom(
  room: MultiplayerRoomRecord,
  storage: MultiplayerStorage,
) {
  return (await storage.getRoom(room.roomCode)) ?? room;
}

export function timeoutIdempotencyKey(roomId: string, revision: number) {
  const hex = createHash("sha256")
    .update(`${roomId}:timeout:${revision}`)
    .digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
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

async function requireSeatContext(
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
  const context = await storage.getSeatContext(
    room.id,
    seatTokenHash(seatToken),
  );
  if (!context.seat) {
    throw new MultiplayerServiceError(
      "SEAT_REQUIRED",
      "유효한 참가 좌석이 없습니다.",
    );
  }
  return { ...context, seat: context.seat };
}

type SeatContext = MultiplayerSeatContext & { seat: TeamSide };

function oppositeSeat(seat: TeamSide): TeamSide {
  return seat === "away" ? "home" : "away";
}

function buildSnapshot(
  room: MultiplayerRoomRecord,
  seatContext: SeatContext,
  now = Date.now(),
): MultiplayerRoomSnapshot {
  const seat = seatContext.seat;
  const clock = resolveClockState(room.clock, room.revision);
  const playing = room.status === "playing" && !clock.forfeitedBy;
  const actionOwner = getActionOwner(room.state);
  const isYourTurn = playing && actionOwner === seat;
  return {
    roomCode: room.roomCode,
    status: room.status,
    seat,
    opponent: getOpponentStatus(seatContext.presence[oppositeSeat(seat)], now),
    actionOwner,
    isYourTurn,
    legalCards:
      isYourTurn && room.state.phase === "awaiting_card"
        ? getLegalCards(room.state)
        : [],
    view: getGameView(room.state, seat),
    clock: buildShotClockView({
      state: room.state,
      revisionStartedAt: room.revisionStartedAt,
      clock,
      playing,
      now,
    }),
  };
}
