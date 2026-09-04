export const SCHEDULED_INNINGS = [3, 5, 7, 9] as const;

export type ScheduledInnings = (typeof SCHEDULED_INNINGS)[number];
export type TeamSide = "away" | "home";
export type HalfInning = "top" | "bottom";
export type DieKind = "pitch" | "batting" | "hit";

export type PitchFace = "S" | "SM" | "F" | "B" | "C";
export type BattingFace =
  "GF" | "G3" | "GA" | "PO" | "FO" | "F2" | "F3" | "FA" | "HIT" | "HR";
export type HitFace =
  "IH" | "L1" | "L2" | "C1" | "C2" | "R1" | "R2" | "D2" | "D3" | "T3";
export type DieFace = PitchFace | BattingFace | HitFace;

export type CardRole = "offense" | "defense";
export type CardId =
  | "HBP"
  | "WP"
  | "BK"
  | "POE"
  | "SB2"
  | "SB3"
  | "SBH"
  | "SB"
  | "E"
  | "CS2"
  | "CS3"
  | "CSH"
  | "GDP"
  | "PO1"
  | "PO2"
  | "BD"
  | "GBH";

export type CardTiming =
  "before_pitch" | "after_pitch" | "after_contact" | "after_batting";

export type CardInstance = {
  instanceId: string;
  cardId: CardId;
};

export type CardZone = {
  drawPile: CardInstance[];
  hand: CardInstance[];
  discardPile: CardInstance[];
};

export type PlayedCard = CardInstance & {
  role: CardRole;
};

export type CardWindow = {
  timing: CardTiming;
  priorityOrder: CardRole[];
  priorityIndex: number;
  respondingTo: PlayedCard | null;
};

export type PendingResolution =
  | { kind: "pitch"; face: PitchFace }
  | { kind: "contact" }
  | { kind: "batting"; face: Exclude<BattingFace, "HIT"> };

export type CardAvailability = {
  instance: CardInstance;
  playable: boolean;
  reason: string | null;
};

export type GameConfig = {
  innings: ScheduledInnings;
  awayTeamName: string;
  homeTeamName: string;
};

export type GamePhase =
  | "awaiting_pitch"
  | "awaiting_batting"
  | "awaiting_hit"
  | "awaiting_card"
  | "finished";

export type GameAction =
  | { type: "PITCH_RESULT"; face: PitchFace }
  | { type: "BATTING_RESULT"; face: BattingFace }
  | { type: "HIT_RESULT"; face: HitFace }
  | { type: "PLAY_CARD"; cardInstanceId: string }
  | { type: "PASS_CARD_WINDOW" };

export type BaseName = "first" | "second" | "third";
export type RunnerOrigin = BaseName | "batter";
export type RunnerDestination = BaseName | "home" | "out";

export type Bases = Record<BaseName, boolean>;

export type RunnerMove = {
  runner: RunnerOrigin;
  from: RunnerOrigin;
  to: RunnerDestination;
};

export type GameEventKind =
  | "die_roll"
  | "count"
  | "plate_appearance"
  | "card_play"
  | "card_resolve"
  | "card_pass"
  | "half_inning"
  | "game_end";

export type GameEvent = {
  sequence: number;
  revision: number;
  inning: number;
  half: HalfInning;
  kind: GameEventKind;
  summary: string;
  die?: DieKind;
  face?: DieFace;
  cardId?: CardId;
  cardRole?: CardRole;
  runs: number;
  outsRecorded: number;
  moves: RunnerMove[];
};

export type GameState = {
  schemaVersion: 2;
  rulesetVersion: "cards-v1";
  revision: number;
  config: GameConfig;
  phase: GamePhase;
  inning: number;
  half: HalfInning;
  battingTeam: TeamSide;
  outs: 0 | 1 | 2;
  balls: 0 | 1 | 2 | 3;
  strikes: 0 | 1 | 2;
  bases: Bases;
  score: Record<TeamSide, number>;
  winner: TeamSide | null;
  rng: {
    algorithm: "mulberry32-v1";
    state: number;
  };
  cards: Record<CardRole, CardZone>;
  cardWindow: CardWindow | null;
  pendingResolution: PendingResolution | null;
  eventLog: GameEvent[];
};

export type RuleErrorCode =
  | "GAME_FINISHED"
  | "WRONG_PHASE"
  | "INVALID_FACE"
  | "CARD_NOT_IN_HAND"
  | "CARD_NOT_PLAYABLE";

export type GameViewer = "public" | TeamSide | "debug";

export type CardZoneView = {
  handCount: number;
  drawCount: number;
  discardCount: number;
  hand: CardInstance[] | null;
};

export type GameView = Omit<GameState, "cards" | "rng"> & {
  cards: Record<CardRole, CardZoneView>;
};

export type RuleError = {
  code: RuleErrorCode;
  message: string;
  expectedAction: GameAction["type"] | null;
};

export type TransitionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; state: GameState; error: RuleError };
