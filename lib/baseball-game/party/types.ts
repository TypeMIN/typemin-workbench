import type {
  CardAvailability,
  GameConfig,
  GameEvent,
  GameState,
  GameView,
  TeamSide,
} from "../types";
import type { MultiplayerCommand } from "../multiplayer/types";

export const PARTY_TEAM_CAPACITY = 8;
export const PARTY_OFFLINE_AFTER_MS = 25_000;

export type PartyRoomStatus =
  "lobby" | "playing" | "paused" | "finished" | "expired";

export type PartyPlayer = {
  id: string;
  nickname: string;
  team: TeamSide;
  connected: boolean;
};

export type PartyStoredPlayer = Omit<PartyPlayer, "connected"> & {
  tokenHash: string;
  joinedAt: string;
  lastSeenAt: string;
  removedAt: string | null;
};

export type PartySessionState = {
  version: 1;
  lineupSeed: number | null;
  lineups: Record<TeamSide, string[]>;
  battingIndex: Record<TeamSide, number>;
  defenseIndex: Record<TeamSide, number>;
  endedReason: "host_ended" | null;
};

export type PartyHostCommand =
  | { type: "UPDATE_CONFIG"; config: GameConfig }
  | { type: "MOVE_PLAYER"; playerId: string; team: TeamSide }
  | { type: "REMOVE_PLAYER"; playerId: string }
  | { type: "START_GAME" }
  | { type: "PAUSE_GAME" }
  | { type: "RESUME_GAME" }
  | { type: "SKIP_ACTIVE_PLAYER" }
  | { type: "END_GAME" };

export type PartyRoomRecord = {
  id: string;
  roomCode: string;
  status: PartyRoomStatus;
  state: GameState;
  revision: number;
  roomRevision: number;
  hostTokenHash: string;
  partyState: PartySessionState;
  expiresAt: string;
};

export type PartyPublicSnapshot = {
  roomCode: string;
  status: PartyRoomStatus;
  roomRevision: number;
  actionOwner: TeamSide | null;
  players: Record<TeamSide, PartyPlayer[]>;
  activeBatterId: string | null;
  activeDefenderId: string | null;
  view: GameView;
  isHost: boolean;
};

export type PartyPlayerSnapshot = PartyPublicSnapshot & {
  me: PartyPlayer;
  canAct: boolean;
  legalCards: CardAvailability[];
};

export type PartyCreateResult = {
  room: PartyRoomRecord;
  hostToken: string;
};

export type PartyJoinResult = {
  playerToken: string;
  snapshot: PartyPlayerSnapshot;
};

export type PartyActionInput = {
  command: MultiplayerCommand;
  expectedRevision: number;
  expectedRoomRevision: number;
  idempotencyKey: string;
};

export type PartyActionCommitInput = {
  roomId: string;
  expectedRevision: number;
  expectedRoomRevision: number;
  newState: GameState;
  newPartyState: PartySessionState;
  actorTeam: TeamSide;
  actorPlayerId: string;
  action: object;
  events: GameEvent[];
  idempotencyKey: string;
};

export type PartyMutationCommitInput = {
  roomId: string;
  expectedRoomRevision: number;
  status: PartyRoomStatus;
  state: GameState;
  partyState: PartySessionState;
  eventType: string;
  actorPlayerId?: string | null;
  payload?: Record<string, unknown>;
};

export type PartyCommitResult =
  | { status: "applied" | "duplicate"; revision: number; roomRevision: number }
  | { status: "conflict" | "invalid" };

export function emptyPartyState(): PartySessionState {
  return {
    version: 1,
    lineupSeed: null,
    lineups: { away: [], home: [] },
    battingIndex: { away: 0, home: 0 },
    defenseIndex: { away: -1, home: 0 },
    endedReason: null,
  };
}
