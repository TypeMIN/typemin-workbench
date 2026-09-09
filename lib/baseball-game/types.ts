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

export type PitchTarget =
  "high_inside" | "high_outside" | "low_inside" | "low_outside" | "ball";

export type SwingDecision = "swing" | "take";
export type DuelWinner = "batter" | "pitcher";

export type PitchHint = FieldPoint & {
  radius: number;
  read: "likely_strike" | "borderline" | "likely_ball";
};

export type PitchDuelState = {
  sequence: number;
  status: "pitch_locked" | "revealed";
  pitcherChoice: PitchTarget;
  hint: PitchHint;
  batterDecision: SwingDecision | null;
  duelWinner: DuelWinner | null;
  actualLocation: PitchLocation | null;
  result: PitchFace | null;
};

export type PitchDuelView = Omit<PitchDuelState, "pitcherChoice" | "hint"> & {
  pitcherLocked: boolean;
  pitcherChoice: PitchTarget | null;
  hint: PitchHint | null;
};

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
  | "SQ1"
  | "SQ2"
  | "E"
  | "1H1E"
  | "HRC"
  | "HNR"
  | "RNH"
  | "SNO"
  | "CIB"
  | "IOB"
  | "CS2"
  | "CS3"
  | "CSH"
  | "GDP"
  | "PO1"
  | "PO2"
  | "BD"
  | "GBH"
  | "GTP"
  | "LDP"
  | "A2"
  | "A3H"
  | "AHH"
  | "A3F"
  | "AHF"
  | "IFD"
  | "CO1"
  | "CO3"
  | "FFO"
  | "RHB";

export type CardTier = "basic" | "intermediate" | "advanced";

export type CardTiming =
  | "before_pitch"
  | "after_pitch"
  | "after_contact"
  | "after_batting"
  | "after_hit";

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
  | { kind: "batting"; face: BattingFace }
  | { kind: "hit"; face: HitFace }
  | {
      kind: "run_hit_pitch";
      face: Exclude<PitchFace, "F" | "C">;
      runners: Array<"first" | "second">;
    };

export type ActiveStrategy = {
  cardId: "HNR" | "RNH";
  cardInstanceId: string;
} | null;

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
  | "awaiting_swing"
  | "awaiting_batting"
  | "awaiting_hit"
  | "awaiting_card"
  | "finished";

export type GameAction =
  | { type: "SELECT_PITCH"; target: PitchTarget }
  | { type: "SELECT_SWING"; decision: SwingDecision }
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

export type InningScore = {
  away: number | null;
  home: number | null;
};

export type TeamBoxScore = {
  hits: number;
  errors: number;
  freePasses: number;
};

export type BoxScore = {
  innings: InningScore[];
  totals: Record<TeamSide, TeamBoxScore>;
};

export type ScoringRecord = {
  hit: boolean;
  error: boolean;
  freePass: boolean;
};

export type FieldPoint = {
  x: number;
  y: number;
};

export type PitchLocation = FieldPoint & {
  zone: "strike" | "ball" | "edge";
  pitchNumber: number;
};

export type PresentationCue =
  | { type: "pitch"; location: PitchLocation; face: PitchFace }
  | { type: "call"; call: "ball" | "strike" | "foul" | "contact" }
  | { type: "batted_ball"; face: BattingFace | HitFace }
  | { type: "catch"; location: FieldPoint }
  | { type: "throw"; from: FieldPoint; to: FieldPoint }
  | { type: "runner_move"; move: RunnerMove }
  | { type: "decision"; result: "safe" | "out" | "score" };

export type AudioCue =
  | "pitch"
  | "mitt"
  | "contact"
  | "ground"
  | "throw"
  | "safe"
  | "out"
  | "score"
  | "home_run"
  | "ball"
  | "strike";

export type GameEventKind =
  | "pitch_commit"
  | "pitch_result"
  | "batted_ball"
  | "die_roll"
  | "count"
  | "plate_appearance"
  | "card_play"
  | "card_resolve"
  | "card_pass"
  | "rule"
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
  scoring?: ScoringRecord;
  pitchTarget?: PitchTarget;
  swingDecision?: SwingDecision;
  pitchLocation?: PitchLocation;
  pitchHint?: PitchHint;
  duelWinner?: DuelWinner;
};

export type GameState = {
  schemaVersion: 6;
  rulesetVersion: "pitch-duel-v2";
  presentationVersion: "broadcast-v2";
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
  boxScore: BoxScore;
  winner: TeamSide | null;
  rng: {
    algorithm: "mulberry32-v1";
    state: number;
  };
  cards: Record<CardRole, CardZone>;
  cardWindow: CardWindow | null;
  pendingResolution: PendingResolution | null;
  activeStrategy: ActiveStrategy;
  pitchDuel: PitchDuelState | null;
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

export type GameView = Omit<GameState, "cards" | "rng" | "pitchDuel"> & {
  cards: Record<CardRole, CardZoneView>;
  pitchDuel: PitchDuelView | null;
};

export type RuleError = {
  code: RuleErrorCode;
  message: string;
  expectedAction: GameAction["type"] | null;
};

export type TransitionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; state: GameState; error: RuleError };
