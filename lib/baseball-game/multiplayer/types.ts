import type {
  CardAvailability,
  GameAction,
  GameConfig,
  GameEvent,
  GameState,
  GameView,
  PitchTarget,
  SwingDecision,
  TeamSide,
} from "../types";
import type { OpponentStatus } from "./presence";
import type { MultiplayerClockState, ShotClockView } from "./shot-clock";

export type MultiplayerRoomStatus =
  "lobby" | "playing" | "finished" | "expired";

export type MultiplayerCommand =
  | { type: "SELECT_PITCH"; target: PitchTarget }
  | { type: "SELECT_SWING"; decision: SwingDecision }
  | { type: "PLAY_CARD"; cardInstanceId: string }
  | { type: "PASS_CARD_WINDOW" };

export type MultiplayerRoomSnapshot = {
  roomCode: string;
  status: MultiplayerRoomStatus;
  seat: TeamSide;
  opponent: OpponentStatus;
  actionOwner: TeamSide | null;
  isYourTurn: boolean;
  legalCards: CardAvailability[];
  view: GameView;
  clock: ShotClockView;
};

export type MultiplayerRoomRecord = {
  id: string;
  roomCode: string;
  status: MultiplayerRoomStatus;
  state: GameState;
  revision: number;
  revisionStartedAt: string;
  clock: MultiplayerClockState | null;
  expiresAt: string;
};

export type MultiplayerCreateResult = {
  room: MultiplayerRoomRecord;
  seatToken: string;
};

export type MultiplayerCommitInput = {
  roomId: string;
  expectedRevision: number;
  newState: GameState;
  actorTeam: TeamSide;
  action: GameAction;
  events: GameEvent[];
  idempotencyKey: string;
  clock: MultiplayerClockState;
};

export type MultiplayerClockUpdateInput = {
  roomId: string;
  revision: number;
  expectedClock: MultiplayerClockState | null;
  clock: MultiplayerClockState;
  finish: boolean;
};

export type MultiplayerCommitResult =
  | { status: "applied" | "duplicate"; revision: number }
  | { status: "conflict" | "invalid" };

export type CreateMultiplayerRoomInput = {
  config: GameConfig;
};
