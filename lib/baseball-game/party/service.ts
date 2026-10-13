import "server-only";

import { randomInt } from "node:crypto";

import {
  createGame,
  getActionActor,
  getActionOwner,
  getGameView,
  getLegalCards,
  getPendingOwners,
  transition,
} from "../engine";
import { commandToGameAction } from "../multiplayer/command";
import { chooseTimeoutAction } from "../multiplayer/shot-clock";
import { timeoutIdempotencyKey } from "../multiplayer/service";
import { getPresentationReadyAt } from "../presentation-gate";
import { notifyRoomChanged, roomTopic } from "../realtime";
import { canRebaseDuelLock, isDuelLock } from "../multiplayer/duel-lock";
import { newRoomCode, normalizeRoomCode } from "../multiplayer/security";
import type { GameConfig, TeamSide } from "../types";
import {
  buildPartyShotClockView,
  getPartyClockWindow,
  nextPartyClock,
  restartPartyClock,
} from "./clock";
import { newPartyToken, partyTokenHash } from "./security";
import { getPartyStorage, type PartyStorage } from "./storage";
import {
  emptyPartyState,
  PARTY_OFFLINE_AFTER_MS,
  PARTY_TEAM_CAPACITY,
  type PartyActionInput,
  type PartyHostCommand,
  type PartyPlayerSnapshot,
  type PartyPublicSnapshot,
  type PartyRoomRecord,
  type PartySessionState,
  type PartyStoredPlayer,
} from "./types";

export type PartyServiceErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_UNAVAILABLE"
  | "HOST_REQUIRED"
  | "PLAYER_REQUIRED"
  | "TEAM_FULL"
  | "NICKNAME_TAKEN"
  | "NOT_ACTIVE_PLAYER"
  | "INVALID_ACTION"
  | "INVALID_COMMAND"
  | "REVISION_CONFLICT"
  | "PRESENTATION_IN_PROGRESS"
  | "STORAGE_ERROR";

export class PartyServiceError extends Error {
  constructor(
    public readonly code: PartyServiceErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export async function createPartyRoom(
  config: GameConfig,
  storage: PartyStorage = getPartyStorage(),
) {
  const hostToken = newPartyToken();
  const state = createGame(config, { seed: randomInt(0, 0x1_0000_0000) });
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const room = await storage.createRoom({
        roomCode: newRoomCode(),
        state,
        hostTokenHash: partyTokenHash(hostToken),
        partyState: emptyPartyState(),
      });
      return { room, hostToken };
    } catch (error) {
      if (error instanceof Error && error.message === "ROOM_CODE_CONFLICT")
        continue;
      throw storageError("파티 방을 만들지 못했습니다.");
    }
  }
  throw storageError("사용할 수 있는 방 코드를 만들지 못했습니다.");
}

export async function joinPartyRoom(
  roomCode: string,
  input: { nickname: string; team: TeamSide; expectedRoomRevision: number },
  storage: PartyStorage = getPartyStorage(),
) {
  const loaded = await requireRoomWithPlayers(roomCode, storage);
  const room = loaded.room;
  if (room.status !== "lobby") {
    throw new PartyServiceError(
      "ROOM_UNAVAILABLE",
      "경기가 시작되어 관전 화면으로 연결합니다.",
    );
  }
  const nickname = input.nickname.trim();
  if (nickname.length < 1 || nickname.length > 12) {
    throw new PartyServiceError(
      "INVALID_COMMAND",
      "닉네임은 1~12자로 입력해 주세요.",
    );
  }
  const players = activePlayers(loaded.players);
  if (
    players.some(
      (player) =>
        normalizedNickname(player.nickname) === normalizedNickname(nickname),
    )
  ) {
    throw new PartyServiceError(
      "NICKNAME_TAKEN",
      "이미 사용 중인 닉네임입니다.",
    );
  }
  if (
    players.filter((player) => player.team === input.team).length >=
    PARTY_TEAM_CAPACITY
  ) {
    throw new PartyServiceError("TEAM_FULL", "선택한 팀의 정원이 찼습니다.");
  }
  if (room.roomRevision !== input.expectedRoomRevision) {
    throw revisionConflict();
  }
  const playerToken = newPartyToken();
  let joined;
  try {
    joined = await storage.joinPlayer({
      roomCode: room.roomCode,
      nickname,
      team: input.team,
      tokenHash: partyTokenHash(playerToken),
      expectedRoomRevision: input.expectedRoomRevision,
    });
  } catch {
    throw storageError("파티 참가 정보를 저장하지 못했습니다.");
  }
  if (!joined) throw revisionConflict();
  const snapshot = await getPartyPlayerSnapshot(
    room.roomCode,
    playerToken,
    storage,
  );
  notifyRoomChanged(room.id, {
    revision: room.revision,
    roomRevision: snapshot.roomRevision,
  });
  return { playerToken, snapshot };
}

export async function getPartyPublicSnapshot(
  roomCode: string,
  hostToken: string | null,
  storage: PartyStorage = getPartyStorage(),
): Promise<PartyPublicSnapshot> {
  const loaded = await requireRoomWithPlayers(roomCode, storage);
  const players = activePlayers(loaded.players);
  const room = await settleExpiredPartyDecision(loaded.room, players, storage);
  return buildPublicSnapshot(
    room,
    players,
    Boolean(hostToken && partyTokenHash(hostToken) === room.hostTokenHash),
  );
}

export async function getPartyPlayerSnapshot(
  roomCode: string,
  playerToken: string | null,
  storage: PartyStorage = getPartyStorage(),
): Promise<PartyPlayerSnapshot> {
  const loaded = await requireRoomWithPlayers(roomCode, storage);
  const players = activePlayers(loaded.players);
  const player = requirePlayerIn(players, playerToken);
  const room = await settleExpiredPartyDecision(loaded.room, players, storage);
  const publicSnapshot = buildPublicSnapshot(room, players, false);
  const actionOwner = getActionOwner(room.state);
  return {
    ...publicSnapshot,
    me: toPublicPlayer(player),
    canAct:
      room.status === "playing" &&
      pendingPlayerIds(room, players).includes(player.id),
    legalCards:
      actionOwner === player.team && room.state.phase === "awaiting_card"
        ? getLegalCards(room.state)
        : [],
    view: getGameView(room.state, player.team),
  };
}

export async function heartbeatPartyPlayer(
  roomCode: string,
  playerToken: string | null,
  storage: PartyStorage = getPartyStorage(),
) {
  const { room, players } = await requireRoomWithPlayers(roomCode, storage);
  const player = requirePlayerIn(activePlayers(players), playerToken);
  if (!(await storage.heartbeat(room.id, player.id))) {
    throw new PartyServiceError(
      "PLAYER_REQUIRED",
      "참가자 세션이 만료되었습니다.",
    );
  }
}

export async function submitPartyHostCommand(
  roomCode: string,
  hostToken: string | null,
  input: { command: PartyHostCommand; expectedRoomRevision: number },
  storage: PartyStorage = getPartyStorage(),
) {
  const loaded = await requireRoomWithPlayers(roomCode, storage);
  const room = loaded.room;
  requireHost(room, hostToken);
  if (room.roomRevision !== input.expectedRoomRevision)
    throw revisionConflict();
  const players = activePlayers(loaded.players);
  const next = applyHostCommand(room, players, input.command, Date.now());
  let commit;
  try {
    commit = await storage.commitHostMutation({
      roomId: room.id,
      expectedRoomRevision: input.expectedRoomRevision,
      status: next.status,
      state: next.state,
      partyState: next.partyState,
      eventType: input.command.type.toLocaleLowerCase("en-US"),
      playerOperation: next.playerOperation,
      payload: next.payload,
    });
  } catch {
    throw storageError("방장 명령을 저장하지 못했습니다.");
  }
  if (commit.status === "conflict") throw revisionConflict();
  if (commit.status === "invalid") {
    throw new PartyServiceError(
      "INVALID_COMMAND",
      "현재 상태에서 실행할 수 없습니다.",
    );
  }
  notifyRoomChanged(room.id, {
    revision: room.revision,
    roomRevision: room.roomRevision + 1,
  });
  return getPartyPublicSnapshot(room.roomCode, hostToken, storage);
}

// Both duel players can submit against the same revision; the later one is
// replayed on the fresh state instead of bouncing back with a conflict.
const MAX_DUEL_REBASE_ATTEMPTS = 3;

export async function submitPartyAction(
  roomCode: string,
  playerToken: string | null,
  input: PartyActionInput,
  storage: PartyStorage = getPartyStorage(),
) {
  const loaded = await requireRoomWithPlayers(roomCode, storage);
  let players = activePlayers(loaded.players);
  const player = requirePlayerIn(players, playerToken);
  const duplicate = await storage.getIdempotency(
    loaded.room.id,
    input.idempotencyKey,
  );
  if (duplicate) {
    return getPartyPlayerSnapshot(loaded.room.roomCode, playerToken, storage);
  }
  let room = await settleExpiredPartyDecision(loaded.room, players, storage);
  for (let attempt = 0; ; attempt += 1) {
    if (room.status !== "playing") {
      throw new PartyServiceError(
        "ROOM_UNAVAILABLE",
        room.status === "paused"
          ? "방장이 경기를 일시정지했습니다."
          : "진행 중인 경기가 아닙니다.",
      );
    }
    const stale =
      room.roomRevision !== input.expectedRoomRevision ||
      room.revision !== input.expectedRevision;
    if (stale && !canRebaseDuelLock(room.state, input)) {
      throw revisionConflict();
    }
    if (
      Date.now() < getPresentationReadyAt(room.state, room.revisionStartedAt)
    ) {
      throw new PartyServiceError(
        "PRESENTATION_IN_PROGRESS",
        "경기장 화면에서 플레이가 끝난 뒤에 선택할 수 있습니다.",
      );
    }
    const action = commandToGameAction(room.state, input.command);
    if (!action) {
      throw new PartyServiceError(
        "INVALID_ACTION",
        "현재 단계에서 실행할 수 없는 행동입니다.",
      );
    }
    const actorTeam = getActionActor(room.state, action);
    if (
      actorTeam !== player.team ||
      !pendingPlayerIds(room, players).includes(player.id)
    ) {
      throw new PartyServiceError(
        "NOT_ACTIVE_PLAYER",
        "현재 활성 선수만 행동할 수 있습니다.",
      );
    }
    const result = transition(room.state, action);
    if (!result.ok)
      throw new PartyServiceError("INVALID_ACTION", result.error.message);
    const nextPartyState = {
      ...rotatePartyStateAfterTransition(room, result.state, result.events),
      clock: nextPartyClock(room, result.state, {
        now: Date.now(),
        timedOutTeam: null,
      }),
    };
    let commit;
    try {
      commit = await storage.commitAction({
        roomId: room.id,
        expectedRevision: room.revision,
        expectedRoomRevision: room.roomRevision,
        newState: result.state,
        newPartyState: nextPartyState,
        actorTeam: player.team,
        actorPlayerId: player.id,
        action,
        events: result.events,
        idempotencyKey: input.idempotencyKey,
      });
    } catch {
      throw storageError("경기 행동을 저장하지 못했습니다.");
    }
    if (commit.status === "conflict") {
      if (attempt + 1 < MAX_DUEL_REBASE_ATTEMPTS && isDuelLock(input.command)) {
        const reloaded = await requireRoomWithPlayers(roomCode, storage);
        room = reloaded.room;
        players = activePlayers(reloaded.players);
        continue;
      }
      throw revisionConflict();
    }
    if (commit.status === "invalid") {
      throw new PartyServiceError(
        "INVALID_ACTION",
        "저장할 수 없는 경기 행동입니다.",
      );
    }
    notifyRoomChanged(room.id, {
      revision: result.state.revision,
      roomRevision: room.roomRevision + 1,
    });
    return getPartyPlayerSnapshot(room.roomCode, playerToken, storage);
  }
}

// A v4 duel can expire twice in a row: the pitch is filled first, then the
// swing that the carried deadline has already run out on.
const MAX_TIMEOUT_STEPS = 2;

/**
 * Expired decisions are filled lazily by whichever screen polls first, like
 * multiplayer rooms. Party play never forfeits: the clock only keeps a
 * distracted player from stalling the room. The idempotency key comes from
 * the revision, so concurrent pollers commit at most one automatic action.
 */
async function settleExpiredPartyDecision(
  room: PartyRoomRecord,
  players: PartyStoredPlayer[],
  storage: PartyStorage,
): Promise<PartyRoomRecord> {
  let current = room;
  for (let step = 0; step < MAX_TIMEOUT_STEPS; step += 1) {
    const now = Date.now();
    const window = getPartyClockWindow(current);
    if (!window || now < window.deadlineAt) return current;
    const action = chooseTimeoutAction(current.state, (size) =>
      randomInt(0, size),
    );
    if (!action) return current;
    const result = transition(current.state, action);
    if (!result.ok) return current;
    const team = getActionActor(current.state, action);
    if (!team) return current;
    try {
      const actorId =
        activePlayerForTeam(current, players, team) ??
        players.find((player) => player.team === team)?.id;
      if (!actorId) return current;
      const commit = await storage.commitAction({
        roomId: current.id,
        expectedRevision: current.revision,
        expectedRoomRevision: current.roomRevision,
        newState: result.state,
        newPartyState: {
          ...rotatePartyStateAfterTransition(
            current,
            result.state,
            result.events,
          ),
          clock: nextPartyClock(current, result.state, {
            now,
            timedOutTeam: team,
          }),
        },
        actorTeam: team,
        actorPlayerId: actorId,
        action,
        events: result.events,
        idempotencyKey: timeoutIdempotencyKey(current.id, current.revision),
      });
      if (commit.status === "applied") {
        notifyRoomChanged(current.id, {
          revision: commit.revision,
          roomRevision: commit.roomRevision,
        });
      }
      current = (await storage.getRoom(current.roomCode)) ?? current;
    } catch {
      return current;
    }
  }
  return current;
}

function applyHostCommand(
  room: PartyRoomRecord,
  players: PartyStoredPlayer[],
  command: PartyHostCommand,
  now: number,
) {
  let status = room.status;
  let state = structuredClone(room.state);
  let partyState = structuredClone(room.partyState);
  let playerOperation:
    | { type: "move"; playerId: string; team: TeamSide }
    | { type: "remove"; playerId: string }
    | null = null;
  let payload: Record<string, unknown> = {};

  if (command.type === "UPDATE_CONFIG") {
    requireLobby(room);
    state = createGame(command.config, { seed: state.rng.state });
    payload = { config: command.config };
  } else if (command.type === "MOVE_PLAYER") {
    requireLobby(room);
    const player = players.find(
      (candidate) => candidate.id === command.playerId,
    );
    if (!player) throw invalidCommand("참가자를 찾을 수 없습니다.");
    if (player.team === command.team)
      throw invalidCommand("이미 해당 팀에 있습니다.");
    if (
      players.filter((candidate) => candidate.team === command.team).length >=
      PARTY_TEAM_CAPACITY
    ) {
      throw new PartyServiceError("TEAM_FULL", "이동할 팀의 정원이 찼습니다.");
    }
    playerOperation = { type: "move", playerId: player.id, team: command.team };
    payload = { playerId: player.id, team: command.team };
  } else if (command.type === "REMOVE_PLAYER") {
    const player = players.find(
      (candidate) => candidate.id === command.playerId,
    );
    if (!player) throw invalidCommand("참가자를 찾을 수 없습니다.");
    playerOperation = { type: "remove", playerId: player.id };
    partyState = removeFromLineups(partyState, player.id);
    const remaining = players.filter((candidate) => candidate.id !== player.id);
    if (
      room.status !== "lobby" &&
      (!remaining.some((candidate) => candidate.team === "away") ||
        !remaining.some((candidate) => candidate.team === "home"))
    ) {
      status = "paused";
    }
    payload = { playerId: player.id };
  } else if (command.type === "START_GAME") {
    requireLobby(room);
    if (
      !players.some((player) => player.team === "away") ||
      !players.some((player) => player.team === "home")
    ) {
      throw invalidCommand("양 팀에 한 명 이상 참가해야 시작할 수 있습니다.");
    }
    const lineupSeed = randomInt(0, 0x1_0000_0000);
    partyState = createLineups(players, lineupSeed);
    partyState.clock = restartPartyClock({ ...room, partyState }, now);
    status = "playing";
    payload = { lineupSeed };
  } else if (command.type === "PAUSE_GAME") {
    if (room.status !== "playing")
      throw invalidCommand("진행 중인 경기만 일시정지할 수 있습니다.");
    status = "paused";
  } else if (command.type === "RESUME_GAME") {
    if (room.status !== "paused")
      throw invalidCommand("일시정지된 경기만 재개할 수 있습니다.");
    if (
      !players.some((player) => player.team === "away") ||
      !players.some((player) => player.team === "home")
    ) {
      throw invalidCommand("양 팀에 선수가 있어야 재개할 수 있습니다.");
    }
    partyState.clock = restartPartyClock(room, now);
    status = "playing";
  } else if (command.type === "SKIP_ACTIVE_PLAYER") {
    if (room.status !== "playing" && room.status !== "paused") {
      throw invalidCommand("경기 중에만 현재 선수를 넘길 수 있습니다.");
    }
    const owner = getActionOwner(state);
    if (!owner) throw invalidCommand("현재 행동할 팀이 없습니다.");
    if (partyState.lineups[owner].length < 2) {
      throw invalidCommand("넘길 수 있는 다음 선수가 없습니다.");
    }
    if (owner === state.battingTeam) {
      partyState.battingIndex[owner] = nextIndex(
        partyState.lineups[owner],
        partyState.battingIndex[owner],
      );
    } else {
      partyState.defenseIndex[owner] = nextIndex(
        partyState.lineups[owner],
        partyState.defenseIndex[owner],
      );
    }
    partyState.clock = restartPartyClock(room, now);
  } else if (command.type === "END_GAME") {
    if (room.status === "finished" || room.status === "expired") {
      throw invalidCommand("이미 종료된 경기입니다.");
    }
    state.phase = "finished";
    state.winner = null;
    state.cardWindow = null;
    state.pendingResolution = null;
    partyState.endedReason = "host_ended";
    status = "finished";
  }
  return { status, state, partyState, playerOperation, payload };
}

export function createLineups(
  players: PartyStoredPlayer[],
  seed: number,
): PartySessionState {
  const state = emptyPartyState();
  state.lineupSeed = seed >>> 0;
  state.lineups.away = shuffleIds(
    players
      .filter((player) => player.team === "away")
      .map((player) => player.id),
    seed,
  );
  state.lineups.home = shuffleIds(
    players
      .filter((player) => player.team === "home")
      .map((player) => player.id),
    seed ^ 0x9e3779b9,
  );
  return state;
}

function shuffleIds(ids: string[], seed: number) {
  const values = [...ids];
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [values[index], values[target]] = [values[target], values[index]];
  }
  return values;
}

export function rotatePartyStateAfterTransition(
  room: PartyRoomRecord,
  nextState: PartyRoomRecord["state"],
  events: Array<{ kind: string }>,
) {
  const partyState = structuredClone(room.partyState);
  if (events.some((event) => event.kind === "plate_appearance")) {
    const team = room.state.battingTeam;
    partyState.battingIndex[team] = nextIndex(
      partyState.lineups[team],
      partyState.battingIndex[team],
    );
  }
  if (
    events.some((event) => event.kind === "half_inning") &&
    nextState.battingTeam !== room.state.battingTeam
  ) {
    const defenseTeam = otherTeam(nextState.battingTeam);
    partyState.defenseIndex[defenseTeam] = nextIndex(
      partyState.lineups[defenseTeam],
      partyState.defenseIndex[defenseTeam],
    );
  }
  return partyState;
}

function buildPublicSnapshot(
  room: PartyRoomRecord,
  players: PartyStoredPlayer[],
  isHost: boolean,
): PartyPublicSnapshot {
  const now = Date.now();
  const hasActivePlayers =
    room.status === "playing" || room.status === "paused";
  const publicPlayers = {
    away: players
      .filter((player) => player.team === "away")
      .map(toPublicPlayer),
    home: players
      .filter((player) => player.team === "home")
      .map(toPublicPlayer),
  };
  return {
    roomCode: room.roomCode,
    status: room.status,
    roomRevision: room.roomRevision,
    actionOwner: getActionOwner(room.state),
    players: publicPlayers,
    activeBatterId: hasActivePlayers
      ? activeId(
          room.partyState.lineups[room.state.battingTeam],
          room.partyState.battingIndex[room.state.battingTeam],
        )
      : null,
    activeDefenderId: hasActivePlayers
      ? activeId(
          room.partyState.lineups[otherTeam(room.state.battingTeam)],
          room.partyState.defenseIndex[otherTeam(room.state.battingTeam)],
        )
      : null,
    view: getGameView(room.state, "public"),
    isHost,
    lineups: {
      away: [...room.partyState.lineups.away],
      home: [...room.partyState.lineups.home],
    },
    battingIndex: { ...room.partyState.battingIndex },
    presentationReadyAt: getPresentationReadyAt(
      room.state,
      room.revisionStartedAt,
    ),
    serverNow: now,
    realtimeTopic: roomTopic(room.id),
    shotClock: buildPartyShotClockView(room, now),
  };
}

function activePlayerForTeam(
  room: PartyRoomRecord,
  players: PartyStoredPlayer[],
  team: TeamSide,
) {
  const id =
    team === room.state.battingTeam
      ? activeId(
          room.partyState.lineups[team],
          room.partyState.battingIndex[team],
        )
      : activeId(
          room.partyState.lineups[team],
          room.partyState.defenseIndex[team],
        );
  return players.some((player) => player.id === id) ? id : null;
}

/** Players who still owe a decision; a v4 duel has the batter and pitcher. */
function pendingPlayerIds(room: PartyRoomRecord, players: PartyStoredPlayer[]) {
  return getPendingOwners(room.state)
    .map((team) => activePlayerForTeam(room, players, team))
    .filter((id): id is string => id !== null);
}

function activeId(lineup: string[], index: number) {
  if (!lineup.length || index < 0) return null;
  return lineup[index % lineup.length] ?? null;
}

function nextIndex(lineup: string[], index: number) {
  if (!lineup.length) return 0;
  return (index + 1 + lineup.length) % lineup.length;
}

function removeFromLineups(state: PartySessionState, playerId: string) {
  const next = structuredClone(state);
  for (const team of ["away", "home"] as const) {
    const old = next.lineups[team];
    const removedIndex = old.indexOf(playerId);
    if (removedIndex < 0) continue;
    next.lineups[team] = old.filter((id) => id !== playerId);
    if (removedIndex < next.battingIndex[team]) next.battingIndex[team] -= 1;
    if (removedIndex < next.defenseIndex[team]) next.defenseIndex[team] -= 1;
    next.battingIndex[team] = Math.max(
      0,
      Math.min(next.battingIndex[team], next.lineups[team].length - 1),
    );
    next.defenseIndex[team] = next.lineups[team].length
      ? Math.max(
          0,
          Math.min(next.defenseIndex[team], next.lineups[team].length - 1),
        )
      : 0;
  }
  return next;
}

async function requireRoomWithPlayers(roomCode: string, storage: PartyStorage) {
  let loaded;
  try {
    loaded = await storage.getRoomWithPlayers(normalizeRoomCode(roomCode));
  } catch {
    throw storageError("파티 방을 불러오지 못했습니다.");
  }
  if (!loaded)
    throw new PartyServiceError("ROOM_NOT_FOUND", "방을 찾을 수 없습니다.");
  const { room } = loaded;
  if (room.status === "expired" || Date.parse(room.expiresAt) <= Date.now()) {
    throw new PartyServiceError("ROOM_UNAVAILABLE", "만료된 방입니다.");
  }
  return loaded;
}

function requirePlayerIn(players: PartyStoredPlayer[], token: string | null) {
  if (!token)
    throw new PartyServiceError("PLAYER_REQUIRED", "참가자 세션이 필요합니다.");
  const tokenHash = partyTokenHash(token);
  const player = players.find((candidate) => candidate.tokenHash === tokenHash);
  if (!player)
    throw new PartyServiceError(
      "PLAYER_REQUIRED",
      "참가자 세션이 만료되었습니다.",
    );
  return player;
}

function requireHost(room: PartyRoomRecord, token: string | null) {
  if (!token || partyTokenHash(token) !== room.hostTokenHash) {
    throw new PartyServiceError("HOST_REQUIRED", "방장 권한이 필요합니다.");
  }
}

function requireLobby(room: PartyRoomRecord) {
  if (room.status !== "lobby")
    throw invalidCommand("경기 시작 전 로비에서만 변경할 수 있습니다.");
}

function activePlayers(players: PartyStoredPlayer[]) {
  return players.filter((player) => !player.removedAt);
}

function toPublicPlayer(player: PartyStoredPlayer) {
  return {
    id: player.id,
    nickname: player.nickname,
    team: player.team,
    connected:
      Date.now() - Date.parse(player.lastSeenAt) <= PARTY_OFFLINE_AFTER_MS,
  };
}

function normalizedNickname(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR");
}

function otherTeam(team: TeamSide): TeamSide {
  return team === "away" ? "home" : "away";
}

function invalidCommand(message: string) {
  return new PartyServiceError("INVALID_COMMAND", message);
}

function revisionConflict() {
  return new PartyServiceError(
    "REVISION_CONFLICT",
    "다른 기기에서 방 상태가 먼저 변경되었습니다.",
  );
}

function storageError(message: string) {
  return new PartyServiceError("STORAGE_ERROR", message);
}
