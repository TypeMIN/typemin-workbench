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

export type GameConfig = {
  innings: ScheduledInnings;
  awayTeamName: string;
  homeTeamName: string;
};

export type GamePhase =
  "awaiting_pitch" | "awaiting_batting" | "awaiting_hit" | "finished";

export type GameAction =
  | { type: "PITCH_RESULT"; face: PitchFace }
  | { type: "BATTING_RESULT"; face: BattingFace }
  | { type: "HIT_RESULT"; face: HitFace };

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
  "die_roll" | "count" | "plate_appearance" | "half_inning" | "game_end";

export type GameEvent = {
  sequence: number;
  revision: number;
  inning: number;
  half: HalfInning;
  kind: GameEventKind;
  summary: string;
  die?: DieKind;
  face?: DieFace;
  runs: number;
  outsRecorded: number;
  moves: RunnerMove[];
};

export type GameState = {
  schemaVersion: 1;
  rulesetVersion: "core-v1";
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
  eventLog: GameEvent[];
};

export type RuleErrorCode = "GAME_FINISHED" | "WRONG_PHASE" | "INVALID_FACE";

export type RuleError = {
  code: RuleErrorCode;
  message: string;
  expectedAction: GameAction["type"] | null;
};

export type TransitionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; state: GameState; error: RuleError };
