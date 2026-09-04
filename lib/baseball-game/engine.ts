import { BATTING_DIE_FACES, HIT_DIE_FACES, PITCH_DIE_FACES } from "./rules";
import {
  SCHEDULED_INNINGS,
  type Bases,
  type BattingFace,
  type GameAction,
  type GameConfig,
  type GameEvent,
  type GameEventKind,
  type GamePhase,
  type GameState,
  type HitFace,
  type PitchFace,
  type RuleError,
  type RunnerMove,
  type TeamSide,
  type TransitionResult,
} from "./types";

const EMPTY_BASES: Bases = { first: false, second: false, third: false };

type PlateAppearanceOutcome = {
  summary: string;
  bases: Bases;
  runs?: number;
  outsRecorded?: number;
  moves?: RunnerMove[];
};

const PHASE_ACTION: Record<
  Exclude<GamePhase, "finished">,
  GameAction["type"]
> = {
  awaiting_pitch: "PITCH_RESULT",
  awaiting_batting: "BATTING_RESULT",
  awaiting_hit: "HIT_RESULT",
};

export function createGame(config: GameConfig): GameState {
  if (!SCHEDULED_INNINGS.includes(config.innings)) {
    throw new RangeError("경기 이닝은 3, 5, 7, 9 중 하나여야 합니다.");
  }

  return {
    schemaVersion: 1,
    rulesetVersion: "core-v1",
    revision: 0,
    config: {
      innings: config.innings,
      awayTeamName: config.awayTeamName.trim() || "원정팀",
      homeTeamName: config.homeTeamName.trim() || "홈팀",
    },
    phase: "awaiting_pitch",
    inning: 1,
    half: "top",
    battingTeam: "away",
    outs: 0,
    balls: 0,
    strikes: 0,
    bases: { ...EMPTY_BASES },
    score: { away: 0, home: 0 },
    winner: null,
    eventLog: [],
  };
}

export function getLegalActions(state: GameState): GameAction["type"][] {
  if (state.phase === "finished") return [];
  return [PHASE_ACTION[state.phase]];
}

export function transition(
  state: GameState,
  action: GameAction,
): TransitionResult {
  const validationError = validateAction(state, action);
  if (validationError) return { ok: false, state, error: validationError };

  const next = cloneState(state);
  next.revision += 1;
  const events: GameEvent[] = [];

  if (action.type === "PITCH_RESULT") {
    emit(next, events, {
      kind: "die_roll",
      summary: `투구 주사위 · ${action.face}`,
      die: "pitch",
      face: action.face,
    });
    resolvePitch(next, action.face, events);
  } else if (action.type === "BATTING_RESULT") {
    emit(next, events, {
      kind: "die_roll",
      summary: `타격 주사위 · ${action.face}`,
      die: "batting",
      face: action.face,
    });
    resolveBatting(next, action.face, events);
  } else {
    emit(next, events, {
      kind: "die_roll",
      summary: `안타 주사위 · ${action.face}`,
      die: "hit",
      face: action.face,
    });
    resolveHit(next, action.face, events);
  }

  next.eventLog.push(...events);
  return { ok: true, state: next, events };
}

function validateAction(
  state: GameState,
  action: GameAction,
): RuleError | null {
  if (state.phase === "finished") {
    return {
      code: "GAME_FINISHED",
      message: "이미 종료된 경기입니다.",
      expectedAction: null,
    };
  }

  const expectedAction = PHASE_ACTION[state.phase];
  if (action.type !== expectedAction) {
    return {
      code: "WRONG_PHASE",
      message: `현재 단계에서는 ${expectedAction} 행동이 필요합니다.`,
      expectedAction,
    };
  }

  const validFace =
    (action.type === "PITCH_RESULT" &&
      PITCH_DIE_FACES.includes(action.face as PitchFace)) ||
    (action.type === "BATTING_RESULT" &&
      BATTING_DIE_FACES.includes(action.face as BattingFace)) ||
    (action.type === "HIT_RESULT" &&
      HIT_DIE_FACES.includes(action.face as HitFace));

  return validFace
    ? null
    : {
        code: "INVALID_FACE",
        message: "해당 주사위에 없는 면입니다.",
        expectedAction,
      };
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    config: { ...state.config },
    bases: { ...state.bases },
    score: { ...state.score },
    eventLog: [...state.eventLog],
  };
}

function emit(
  state: GameState,
  events: GameEvent[],
  event: {
    kind: GameEventKind;
    summary: string;
    die?: GameEvent["die"];
    face?: GameEvent["face"];
    runs?: number;
    outsRecorded?: number;
    moves?: RunnerMove[];
  },
) {
  events.push({
    sequence: state.eventLog.length + events.length + 1,
    revision: state.revision,
    inning: state.inning,
    half: state.half,
    kind: event.kind,
    summary: event.summary,
    die: event.die,
    face: event.face,
    runs: event.runs ?? 0,
    outsRecorded: event.outsRecorded ?? 0,
    moves: event.moves ?? [],
  });
}

function resolvePitch(state: GameState, face: PitchFace, events: GameEvent[]) {
  if (face === "C") {
    state.phase = "awaiting_batting";
    emit(state, events, {
      kind: "count",
      summary: "컨택 · 타격 주사위를 굴립니다.",
    });
    return;
  }

  if (face === "B") {
    if (state.balls === 3) {
      finishPlateAppearance(state, events, resolveWalk(state.bases));
    } else {
      state.balls = (state.balls + 1) as GameState["balls"];
      emit(state, events, {
        kind: "count",
        summary: `볼 ${state.balls}`,
      });
    }
    return;
  }

  if (face === "F" && state.strikes === 2) {
    emit(state, events, {
      kind: "count",
      summary: "파울 · 2스트라이크 유지",
    });
    return;
  }

  if (state.strikes === 2) {
    finishPlateAppearance(state, events, {
      summary: face === "SM" ? "헛스윙 삼진" : "삼진",
      bases: { ...state.bases },
      outsRecorded: 1,
      moves: [{ runner: "batter", from: "batter", to: "out" }],
    });
    return;
  }

  state.strikes = (state.strikes + 1) as GameState["strikes"];
  emit(state, events, {
    kind: "count",
    summary:
      face === "F"
        ? `파울 · 스트라이크 ${state.strikes}`
        : `스트라이크 ${state.strikes}`,
  });
}

function resolveWalk(bases: Bases): PlateAppearanceOutcome {
  const nextBases = { ...bases, first: true };
  const moves: RunnerMove[] = [
    { runner: "batter", from: "batter", to: "first" },
  ];
  let runs = 0;

  if (bases.first) {
    nextBases.second = true;
    moves.push({ runner: "first", from: "first", to: "second" });
    if (bases.second) {
      nextBases.third = true;
      moves.push({ runner: "second", from: "second", to: "third" });
      if (bases.third) {
        runs = 1;
        moves.push({ runner: "third", from: "third", to: "home" });
      }
    }
  }

  return { summary: "볼넷", bases: nextBases, runs, moves };
}

function resolveBatting(
  state: GameState,
  face: BattingFace,
  events: GameEvent[],
) {
  if (face === "HIT") {
    state.phase = "awaiting_hit";
    emit(state, events, {
      kind: "count",
      summary: "안타 판정 · 안타 주사위를 굴립니다.",
    });
    return;
  }

  const outcome =
    face === "GF"
      ? resolveGroundForce(state.bases, "선행주자 땅볼")
      : face === "G3"
        ? resolveGroundThree(state.bases)
        : face === "GA"
          ? resolveGroundAdvance(state.bases)
          : face === "PO" || face === "FO"
            ? resolveFlyHold(state.bases, face)
            : face === "F2" || face === "F3" || face === "FA"
              ? resolveTagUp(state.bases, face)
              : resolveHomeRun(state.bases);

  finishPlateAppearance(state, events, outcome);
}

function resolveGroundForce(
  bases: Bases,
  summary: string,
): PlateAppearanceOutcome {
  if (!bases.first) {
    return {
      summary,
      bases: { ...bases },
      outsRecorded: 1,
      moves: [{ runner: "batter", from: "batter", to: "out" }],
    };
  }

  const nextBases: Bases = {
    first: true,
    second: true,
    third: bases.third,
  };
  const moves: RunnerMove[] = [
    { runner: "batter", from: "batter", to: "first" },
    { runner: "first", from: "first", to: "second" },
  ];

  if (bases.second) {
    nextBases.third = true;
    moves.push({
      runner: bases.third ? "third" : "second",
      from: bases.third ? "third" : "second",
      to: "out",
    });
    if (!bases.third) nextBases.third = false;
    if (bases.third) {
      moves.push({ runner: "second", from: "second", to: "third" });
    }
  } else {
    moves.push({ runner: "first", from: "first", to: "out" });
    moves.splice(1, 1);
    nextBases.second = false;
  }

  return { summary, bases: nextBases, outsRecorded: 1, moves };
}

function resolveGroundThree(bases: Bases): PlateAppearanceOutcome {
  const remaining = { ...bases, third: false };
  const ground = resolveGroundForce(remaining, "3루 주자 진루 땅볼");
  if (!bases.third) return ground;

  return {
    ...ground,
    runs: 1,
    moves: [
      { runner: "third", from: "third", to: "home" },
      ...(ground.moves ?? []),
    ],
  };
}

function resolveGroundAdvance(bases: Bases): PlateAppearanceOutcome {
  const moves: RunnerMove[] = [{ runner: "batter", from: "batter", to: "out" }];
  if (bases.first) moves.push({ runner: "first", from: "first", to: "second" });
  if (bases.second)
    moves.push({ runner: "second", from: "second", to: "third" });
  if (bases.third) moves.push({ runner: "third", from: "third", to: "home" });

  return {
    summary: "모든 주자 진루 땅볼",
    bases: { first: false, second: bases.first, third: bases.second },
    runs: bases.third ? 1 : 0,
    outsRecorded: 1,
    moves,
  };
}

function resolveFlyHold(
  bases: Bases,
  face: "PO" | "FO",
): PlateAppearanceOutcome {
  return {
    summary: face === "PO" ? "내야 플라이 아웃" : "외야 플라이 아웃",
    bases: { ...bases },
    outsRecorded: 1,
    moves: [{ runner: "batter", from: "batter", to: "out" }],
  };
}

function resolveTagUp(
  bases: Bases,
  face: "F2" | "F3" | "FA",
): PlateAppearanceOutcome {
  const moves: RunnerMove[] = [{ runner: "batter", from: "batter", to: "out" }];
  let nextBases = { ...bases };
  let runs = 0;

  if (face === "F2") {
    if (bases.third) {
      runs += 1;
      moves.push({ runner: "third", from: "third", to: "home" });
    }
    if (bases.second) {
      moves.push({ runner: "second", from: "second", to: "third" });
    }
    nextBases = { first: bases.first, second: false, third: bases.second };
  } else if (face === "F3") {
    if (bases.third) {
      runs += 1;
      moves.push({ runner: "third", from: "third", to: "home" });
    }
    nextBases.third = false;
  } else {
    if (bases.third) {
      runs += 1;
      moves.push({ runner: "third", from: "third", to: "home" });
    }
    if (bases.second)
      moves.push({ runner: "second", from: "second", to: "third" });
    if (bases.first)
      moves.push({ runner: "first", from: "first", to: "second" });
    nextBases = { first: false, second: bases.first, third: bases.second };
  }

  return {
    summary: `${face} 희생플라이`,
    bases: nextBases,
    runs,
    outsRecorded: 1,
    moves,
  };
}

function resolveHomeRun(bases: Bases): PlateAppearanceOutcome {
  const moves = occupiedRunnerMoves(bases, "home");
  moves.push({ runner: "batter", from: "batter", to: "home" });
  return {
    summary: "홈런",
    bases: { ...EMPTY_BASES },
    runs: occupiedBaseCount(bases) + 1,
    moves,
  };
}

function resolveHit(state: GameState, face: HitFace, events: GameEvent[]) {
  finishPlateAppearance(state, events, hitOutcome(state.bases, face));
}

function hitOutcome(bases: Bases, face: HitFace): PlateAppearanceOutcome {
  if (["IH", "L1", "C1", "R1"].includes(face)) {
    return {
      summary: `${face} 단타`,
      bases: { first: true, second: bases.first, third: bases.second },
      runs: bases.third ? 1 : 0,
      moves: [
        ...moveExistingRunnersOneBase(bases),
        { runner: "batter", from: "batter", to: "first" },
      ],
    };
  }

  if (face === "L2" || face === "C2") {
    return {
      summary: `${face} 단타`,
      bases: { first: true, second: bases.first, third: false },
      runs: Number(bases.second) + Number(bases.third),
      moves: [
        ...scoringMoves(bases, ["second", "third"]),
        ...(bases.first
          ? ([{ runner: "first", from: "first", to: "second" }] as RunnerMove[])
          : []),
        { runner: "batter", from: "batter", to: "first" },
      ],
    };
  }

  if (face === "R2") {
    return {
      summary: "R2 단타",
      bases: { first: true, second: false, third: bases.first },
      runs: Number(bases.second) + Number(bases.third),
      moves: [
        ...scoringMoves(bases, ["second", "third"]),
        ...(bases.first
          ? ([{ runner: "first", from: "first", to: "third" }] as RunnerMove[])
          : []),
        { runner: "batter", from: "batter", to: "first" },
      ],
    };
  }

  if (face === "D2") {
    return {
      summary: "D2 2루타",
      bases: { first: false, second: true, third: bases.first },
      runs: Number(bases.second) + Number(bases.third),
      moves: [
        ...scoringMoves(bases, ["second", "third"]),
        ...(bases.first
          ? ([{ runner: "first", from: "first", to: "third" }] as RunnerMove[])
          : []),
        { runner: "batter", from: "batter", to: "second" },
      ],
    };
  }

  if (face === "D3") {
    return {
      summary: "D3 2루타",
      bases: { first: false, second: true, third: false },
      runs: occupiedBaseCount(bases),
      moves: [
        ...occupiedRunnerMoves(bases, "home"),
        { runner: "batter", from: "batter", to: "second" },
      ],
    };
  }

  return {
    summary: "T3 3루타",
    bases: { first: false, second: false, third: true },
    runs: occupiedBaseCount(bases),
    moves: [
      ...occupiedRunnerMoves(bases, "home"),
      { runner: "batter", from: "batter", to: "third" },
    ],
  };
}

function finishPlateAppearance(
  state: GameState,
  events: GameEvent[],
  outcome: PlateAppearanceOutcome,
) {
  const outsRecorded = outcome.outsRecorded ?? 0;
  const thirdOut = state.outs + outsRecorded >= 3;
  const runs = thirdOut ? 0 : (outcome.runs ?? 0);
  const cancelledRunnerAdvance =
    (outcome.runs ?? 0) > 0 ||
    (outcome.moves ?? []).some(
      (move) => move.runner !== "batter" && move.to !== "out",
    );
  const moves = thirdOut
    ? (outcome.moves ?? []).filter((move) => move.to === "out")
    : (outcome.moves ?? []);

  if (!thirdOut) {
    state.bases = { ...outcome.bases };
    state.outs = (state.outs + outsRecorded) as GameState["outs"];
    state.score[state.battingTeam] += runs;
  }

  resetCount(state);
  state.phase = "awaiting_pitch";
  emit(state, events, {
    kind: "plate_appearance",
    summary: thirdOut
      ? `${outcome.summary} · 3아웃${cancelledRunnerAdvance ? ", 진루와 득점 취소" : ""}`
      : outcome.summary,
    runs,
    outsRecorded,
    moves,
  });

  if (thirdOut) {
    advanceHalfInning(state, events);
    return;
  }

  if (isWalkOff(state)) {
    finishGame(state, "home", events, "홈팀 끝내기 승리");
  }
}

function resetCount(state: GameState) {
  state.balls = 0;
  state.strikes = 0;
}

function advanceHalfInning(state: GameState, events: GameEvent[]) {
  state.outs = 0;
  state.bases = { ...EMPTY_BASES };
  resetCount(state);

  if (state.half === "top") {
    if (
      state.inning >= state.config.innings &&
      state.score.home > state.score.away
    ) {
      finishGame(state, "home", events, "홈팀 리드로 마지막 말 공격 생략");
      return;
    }
    state.half = "bottom";
    state.battingTeam = "home";
    emit(state, events, {
      kind: "half_inning",
      summary: `${state.inning}회말 시작`,
    });
    return;
  }

  if (
    state.inning >= state.config.innings &&
    state.score.home !== state.score.away
  ) {
    const winner: TeamSide =
      state.score.home > state.score.away ? "home" : "away";
    finishGame(state, winner, events, `${state.inning}회 경기 종료`);
    return;
  }

  state.inning += 1;
  state.half = "top";
  state.battingTeam = "away";
  emit(state, events, {
    kind: "half_inning",
    summary: `${state.inning}회초 시작`,
  });
}

function isWalkOff(state: GameState) {
  return (
    state.half === "bottom" &&
    state.inning >= state.config.innings &&
    state.score.home > state.score.away
  );
}

function finishGame(
  state: GameState,
  winner: TeamSide,
  events: GameEvent[],
  summary: string,
) {
  state.phase = "finished";
  state.winner = winner;
  emit(state, events, { kind: "game_end", summary });
}

function occupiedBaseCount(bases: Bases) {
  return Number(bases.first) + Number(bases.second) + Number(bases.third);
}

function occupiedRunnerMoves(bases: Bases, to: RunnerMove["to"]): RunnerMove[] {
  return (["third", "second", "first"] as const)
    .filter((base) => bases[base])
    .map((base) => ({ runner: base, from: base, to }));
}

function moveExistingRunnersOneBase(bases: Bases): RunnerMove[] {
  const moves: RunnerMove[] = [];
  if (bases.third) moves.push({ runner: "third", from: "third", to: "home" });
  if (bases.second)
    moves.push({ runner: "second", from: "second", to: "third" });
  if (bases.first) moves.push({ runner: "first", from: "first", to: "second" });
  return moves;
}

function scoringMoves(
  bases: Bases,
  scoringBases: Array<"first" | "second" | "third">,
): RunnerMove[] {
  return scoringBases
    .filter((base) => bases[base])
    .map((base) => ({ runner: base, from: base, to: "home" }));
}
