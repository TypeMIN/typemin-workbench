import type {
  CardAvailability,
  GameAction,
  GameConfig,
  GameEvent,
  GameState,
  GameView,
  TeamSide,
} from "../types";

export type MultiplayerRoomStatus =
  "lobby" | "playing" | "finished" | "expired";

export type MultiplayerCommand =
  | { type: "ROLL_DIE" }
  | { type: "PLAY_CARD"; cardInstanceId: string }
  | { type: "PASS_CARD_WINDOW" };

export type MultiplayerRoomSnapshot = {
  roomCode: string;
  status: MultiplayerRoomStatus;
  seat: TeamSide;
  opponentConnected: boolean;
  actionOwner: TeamSide | null;
  isYourTurn: boolean;
  legalCards: CardAvailability[];
  view: GameView;
};

export type PartyRoomSnapshot = {
  roomCode: string;
  status: MultiplayerRoomStatus;
  actionOwner: TeamSide | null;
  seats: Record<TeamSide, boolean>;
  view: GameView;
};

export type PartyInviteLinks = {
  awayControllerUrl: string;
  homeControllerUrl: string;
};

export function partyInviteStorageKey(roomCode: string) {
  return `baseball-party:${roomCode.toUpperCase()}:invites`;
}

export type MultiplayerRoomRecord = {
  id: string;
  roomCode: string;
  status: MultiplayerRoomStatus;
  state: GameState;
  revision: number;
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
};

export type MultiplayerCommitResult =
  | { status: "applied" | "duplicate"; revision: number }
  | { status: "conflict" | "invalid" };

export type CreateMultiplayerRoomInput = {
  config: GameConfig;
};
