import { BATTING_DIE_FACES, HIT_DIE_FACES, PITCH_DIE_FACES } from "./rules";
import { CARD_DECK_COUNTS, CARD_DEFINITIONS } from "./cards";
import {
  SCHEDULED_INNINGS,
  type Bases,
  type BattingFace,
  type CardAvailability,
  type CardId,
  type CardInstance,
  type CardRole,
  type CardTiming,
  type CardZone,
  type GameAction,
  type GameConfig,
  type GameEvent,
  type GameEventKind,
  type GamePhase,
  type GameState,
  type GameView,
  type GameViewer,
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
  Exclude<GamePhase, "finished" | "awaiting_card">,
  GameAction["type"]
> = {
  awaiting_pitch: "PITCH_RESULT",
  awaiting_batting: "BATTING_RESULT",
  awaiting_hit: "HIT_RESULT",
};

const DEFAULT_SEED = 0x6d2b79f5;

export function createGame(
  config: GameConfig,
  options: { seed?: number } = {},
): GameState {
  if (!SCHEDULED_INNINGS.includes(config.innings)) {
    throw new RangeError("경기 이닝은 3, 5, 7, 9 중 하나여야 합니다.");
  }

  const rng: GameState["rng"] = {
    algorithm: "mulberry32-v1",
    state: normalizeSeed(options.seed ?? DEFAULT_SEED),
  };
  const cards = {
    offense: createCardZone("offense", rng),
    defense: createCardZone("defense", rng),
  };
  drawToFour(cards.offense, rng);
  drawToFour(cards.defense, rng);

  return {
    schemaVersion: 2,
    rulesetVersion: "cards-v1",
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
    rng,
    cards,
    cardWindow: null,
    pendingResolution: null,
    eventLog: [],
  };
}

export function getLegalActions(state: GameState): GameAction["type"][] {
  if (state.phase === "finished") return [];
  if (state.phase === "awaiting_card") {
    return getLegalCards(state).some((card) => card.playable)
      ? ["PLAY_CARD", "PASS_CARD_WINDOW"]
      : ["PASS_CARD_WINDOW"];
  }
  return [PHASE_ACTION[state.phase]];
}

export function getActionOwner(state: GameState): TeamSide | null {
  if (state.phase === "finished") return null;
  if (state.phase === "awaiting_card" && state.cardWindow) {
    return teamForRole(state, currentCardRole(state));
  }
  return state.phase === "awaiting_pitch"
    ? oppositeTeam(state.battingTeam)
    : state.battingTeam;
}

export function getLegalCards(
  state: GameState,
  role: CardRole = state.cardWindow ? currentCardRole(state) : "offense",
): CardAvailability[] {
  return state.cards[role].hand.map((instance) => {
    const reason = cardUnavailableReason(state, role, instance.cardId);
    return { instance, playable: reason === null, reason };
  });
}

export function getGameView(state: GameState, viewer: GameViewer): GameView {
  const visibleRole =
    viewer === "debug" || viewer === "public"
      ? null
      : viewer === state.battingTeam
        ? "offense"
        : "defense";
  const cloned = cloneState(state);
  const { cards: privateCards, rng: privateRng, ...publicState } = cloned;
  void privateCards;
  void privateRng;
  return {
    ...publicState,
    cards: {
      offense: cardZoneView(
        state.cards.offense,
        viewer === "debug" || visibleRole === "offense",
      ),
      defense: cardZoneView(
        state.cards.defense,
        viewer === "debug" || visibleRole === "defense",
      ),
    },
  };
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

  if (action.type === "PLAY_CARD") {
    playCard(next, action.cardInstanceId, events);
  } else if (action.type === "PASS_CARD_WINDOW") {
    passCardWindow(next, events);
  } else if (action.type === "PITCH_RESULT") {
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

  if (state.phase === "awaiting_card") {
    if (action.type === "PASS_CARD_WINDOW") return null;
    if (action.type !== "PLAY_CARD") {
      return wrongPhase("PLAY_CARD");
    }
    const role = currentCardRole(state);
    const availability = getLegalCards(state, role).find(
      ({ instance }) => instance.instanceId === action.cardInstanceId,
    );
    if (!availability) {
      return {
        code: "CARD_NOT_IN_HAND",
        message: "현재 결정권자의 손패에 없는 카드입니다.",
        expectedAction: "PLAY_CARD",
      };
    }
    return availability.playable
      ? null
      : {
          code: "CARD_NOT_PLAYABLE",
          message: availability.reason ?? "지금 사용할 수 없는 카드입니다.",
          expectedAction: "PLAY_CARD",
        };
  }

  const expectedAction = PHASE_ACTION[state.phase];
  if (action.type !== expectedAction) {
    return wrongPhase(expectedAction);
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

function wrongPhase(expectedAction: GameAction["type"]): RuleError {
  return {
    code: "WRONG_PHASE",
    message: `현재 단계에서는 ${expectedAction} 행동이 필요합니다.`,
    expectedAction,
  };
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    config: { ...state.config },
    bases: { ...state.bases },
    score: { ...state.score },
    rng: { ...state.rng },
    cards: {
      offense: cloneCardZone(state.cards.offense),
      defense: cloneCardZone(state.cards.defense),
    },
    cardWindow: state.cardWindow
      ? {
          ...state.cardWindow,
          priorityOrder: [...state.cardWindow.priorityOrder],
          respondingTo: state.cardWindow.respondingTo
            ? { ...state.cardWindow.respondingTo }
            : null,
        }
      : null,
    pendingResolution: state.pendingResolution
      ? { ...state.pendingResolution }
      : null,
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
    cardId?: GameEvent["cardId"];
    cardRole?: GameEvent["cardRole"];
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
    cardId: event.cardId,
    cardRole: event.cardRole,
    runs: event.runs ?? 0,
    outsRecorded: event.outsRecorded ?? 0,
    moves: event.moves ?? [],
  });
}

function resolvePitch(state: GameState, face: PitchFace, events: GameEvent[]) {
  if (face === "C") {
    state.pendingResolution = { kind: "contact" };
    if (openCardWindow(state, "after_contact", ["offense"])) return;
    resolvePending(state, events);
    return;
  }

  if (face === "S" || face === "SM" || face === "B") {
    state.pendingResolution = { kind: "pitch", face };
    if (openCardWindow(state, "after_pitch", ["offense"])) return;
    resolvePending(state, events);
    return;
  }

  resolvePitchFace(state, face, events);
}

function resolvePitchFace(
  state: GameState,
  face: PitchFace,
  events: GameEvent[],
) {
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
      prepareNextPitch(state);
    }
    return;
  }

  if (face === "F" && state.strikes === 2) {
    emit(state, events, {
      kind: "count",
      summary: "파울 · 2스트라이크 유지",
    });
    prepareNextPitch(state);
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
  prepareNextPitch(state);
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

  state.pendingResolution = { kind: "batting", face };
  if (openCardWindow(state, "after_batting", ["defense", "offense"])) {
    return;
  }
  resolvePending(state, events);
}

function resolveBattingFace(
  state: GameState,
  face: Exclude<BattingFace, "HIT">,
  events: GameEvent[],
) {
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
    return;
  }

  prepareNextPitch(state);
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
    resetHandsForHalfInning(state);
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
  resetHandsForHalfInning(state);
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

function prepareNextPitch(state: GameState) {
  if (state.phase === "finished") return;
  state.phase = "awaiting_pitch";
  state.pendingResolution = null;
  state.cardWindow = null;
  openCardWindow(state, "before_pitch", ["offense", "defense"]);
}

function openCardWindow(
  state: GameState,
  timing: CardTiming,
  priorityOrder: CardRole[],
) {
  state.phase = "awaiting_card";
  state.cardWindow = {
    timing,
    priorityOrder: [...priorityOrder],
    priorityIndex: 0,
    respondingTo: null,
  };
  if (seekPlayablePriority(state, 0)) return true;
  state.cardWindow = null;
  state.phase = phaseForPending(state.pendingResolution);
  return false;
}

function seekPlayablePriority(state: GameState, startIndex: number) {
  if (!state.cardWindow) return false;
  for (
    let index = startIndex;
    index < state.cardWindow.priorityOrder.length;
    index += 1
  ) {
    state.cardWindow.priorityIndex = index;
    if (getLegalCards(state).some((card) => card.playable)) return true;
  }
  return false;
}

function phaseForPending(pending: GameState["pendingResolution"]): GamePhase {
  if (!pending) return "awaiting_pitch";
  if (pending.kind === "contact") return "awaiting_batting";
  return pending.kind === "pitch" ? "awaiting_pitch" : "awaiting_batting";
}

function currentCardRole(state: GameState): CardRole {
  const window = state.cardWindow;
  if (!window) return "offense";
  if (window.respondingTo) return oppositeRole(window.respondingTo.role);
  return window.priorityOrder[window.priorityIndex] ?? "offense";
}

function cardUnavailableReason(
  state: GameState,
  role: CardRole,
  cardId: CardId,
): string | null {
  const window = state.cardWindow;
  if (state.phase !== "awaiting_card" || !window) {
    return "지금은 카드 선택 단계가 아닙니다.";
  }
  if (role !== currentCardRole(state)) return "상대의 결정 차례입니다.";
  const definition = CARD_DEFINITIONS[cardId];
  if (definition.role !== role) return "이 역할에서 사용할 수 없는 카드입니다.";

  if (window.respondingTo) {
    return responseUnavailableReason(cardId, window.respondingTo.cardId);
  }
  if (definition.timing !== window.timing) {
    return timingReason(window.timing);
  }

  if (cardId === "BK") {
    return occupiedBaseCount(state.bases) > 0 ? null : "주자가 없습니다.";
  }
  if (cardId === "PO1") {
    return state.bases.first && !state.bases.second
      ? null
      : "1루 또는 1·3루 상황이 필요합니다.";
  }
  if (cardId === "PO2") {
    return state.bases.second && !state.bases.third
      ? null
      : "2루 또는 1·2루 상황이 필요합니다.";
  }
  if (cardId === "POE" || cardId.startsWith("CS") || cardId === "BD") {
    return "대응할 상대 카드가 필요합니다.";
  }

  if (window.timing === "after_pitch") {
    const face =
      state.pendingResolution?.kind === "pitch"
        ? state.pendingResolution.face
        : null;
    if (cardId === "HBP") return face === "B" ? null : "볼 결과가 필요합니다.";
    if (cardId === "WP") {
      if (face !== "B") return "볼 결과가 필요합니다.";
      return occupiedBaseCount(state.bases) > 0 ? null : "주자가 없습니다.";
    }
    if (!face || !["S", "SM", "B"].includes(face)) {
      return "스트라이크·헛스윙·볼 결과가 필요합니다.";
    }
    if (cardId === "SB2") {
      return state.bases.first && !state.bases.second
        ? null
        : "1루 주자와 빈 2루가 필요합니다.";
    }
    if (cardId === "SB3") {
      return state.bases.second && !state.bases.third
        ? null
        : "2루 주자와 빈 3루가 필요합니다.";
    }
    if (cardId === "SBH") {
      return state.bases.third ? null : "3루 주자가 필요합니다.";
    }
  }

  if (cardId === "SB") {
    return !state.bases.third && (state.bases.first || state.bases.second)
      ? null
      : "1루·2루 또는 1·2루 주자 상황이 필요합니다.";
  }

  const battingFace =
    state.pendingResolution?.kind === "batting"
      ? state.pendingResolution.face
      : null;
  if (cardId === "GDP") {
    const supportedBases =
      state.bases.first && (!state.bases.third || state.bases.second);
    return state.outs < 2 &&
      supportedBases &&
      (battingFace === "GF" || battingFace === "GA")
      ? null
      : "0·1아웃의 지정된 강제 상황과 GF·GA가 필요합니다.";
  }
  if (cardId === "GBH") {
    return battingFace === "GA" &&
      !state.bases.first &&
      (state.bases.second || state.bases.third)
      ? null
      : "1루 주자 없이 2·3루 주자와 GA가 필요합니다.";
  }
  if (cardId === "E") {
    return battingFace &&
      ["GF", "G3", "GA", "PO", "FO", "F2", "F3", "FA"].includes(battingFace)
      ? null
      : "땅볼 또는 플라이 결과가 필요합니다.";
  }
  return "현재 상황에서 사용할 수 없습니다.";
}

function responseUnavailableReason(cardId: CardId, primary: CardId) {
  const matchingResponse: Partial<Record<CardId, CardId>> = {
    PO1: "POE",
    PO2: "POE",
    SB2: "CS2",
    SB3: "CS3",
    SBH: "CSH",
    SB: "BD",
    GDP: "E",
    GBH: "E",
  };
  return matchingResponse[primary] === cardId
    ? null
    : `${primary}에 대응할 수 없는 카드입니다.`;
}

function timingReason(timing: CardTiming) {
  const labels: Record<CardTiming, string> = {
    before_pitch: "투구 전 카드만 사용할 수 있습니다.",
    after_pitch: "현재 투구 결과에 맞는 카드만 사용할 수 있습니다.",
    after_contact: "컨택 이후 카드만 사용할 수 있습니다.",
    after_batting: "현재 타구 결과에 맞는 카드만 사용할 수 있습니다.",
  };
  return labels[timing];
}

function playCard(state: GameState, instanceId: string, events: GameEvent[]) {
  const window = state.cardWindow;
  if (!window) return;
  const role = currentCardRole(state);
  const zone = state.cards[role];
  const card = zone.hand.find((instance) => instance.instanceId === instanceId);
  if (!card) return;
  spendCard(state, role, card);
  emit(state, events, {
    kind: "card_play",
    summary: `${role === "offense" ? "공격" : "수비"} 카드 · ${CARD_DEFINITIONS[card.cardId].name}`,
    cardId: card.cardId,
    cardRole: role,
  });

  if (window.respondingTo) {
    const primary = window.respondingTo;
    window.respondingTo = null;
    resolveCardPair(state, primary, { ...card, role }, events);
    return;
  }

  const played = { ...card, role };
  window.respondingTo = played;
  if (getLegalCards(state, oppositeRole(role)).some((item) => item.playable)) {
    return;
  }
  window.respondingTo = null;
  resolvePrimaryCard(state, played, events);
}

function passCardWindow(state: GameState, events: GameEvent[]) {
  const window = state.cardWindow;
  if (!window) return;
  const role = currentCardRole(state);
  emit(state, events, {
    kind: "card_pass",
    summary: `${role === "offense" ? "공격" : "수비"} 카드 패스`,
    cardRole: role,
  });
  if (window.respondingTo) {
    const primary = window.respondingTo;
    window.respondingTo = null;
    resolvePrimaryCard(state, primary, events);
    return;
  }
  if (seekPlayablePriority(state, window.priorityIndex + 1)) return;
  closeCardWindow(state, events);
}

function resolvePrimaryCard(
  state: GameState,
  played: NonNullable<GameState["cardWindow"]>["respondingTo"],
  events: GameEvent[],
) {
  if (!played) return;
  const { cardId } = played;
  if (cardId === "BK" || cardId === "WP") {
    applyAllRunnerAdvance(
      state,
      events,
      cardId === "BK" ? "보크 · 모든 주자 진루" : "폭투 · 모든 주자 진루",
      cardId,
    );
    continueCardWindow(state, events);
    return;
  }
  if (cardId === "PO1" || cardId === "PO2") {
    recordRunnerOut(
      state,
      cardId === "PO1" ? "first" : "second",
      events,
      `${CARD_DEFINITIONS[cardId].name} 성공`,
      cardId,
    );
    continueCardWindow(state, events);
    return;
  }
  if (cardId === "HBP") {
    emitCardResolution(state, events, cardId, "몸에 맞는 공 적용");
    finishPlateAppearance(state, events, {
      ...resolveWalk(state.bases),
      summary: "몸에 맞는 공",
    });
    return;
  }
  if (cardId === "SB2" || cardId === "SB3" || cardId === "SBH") {
    resolveSuccessfulSteal(state, cardId, events);
    continueCardWindow(state, events);
    return;
  }
  if (cardId === "SB") {
    emitCardResolution(state, events, cardId, "희생번트 적용");
    finishPlateAppearance(state, events, sacrificeBuntOutcome(state.bases));
    return;
  }
  if (cardId === "E") {
    emitCardResolution(state, events, cardId, "수비 실책 적용");
    finishPlateAppearance(state, events, errorOutcome(state.bases));
    return;
  }
  if (cardId === "GDP") {
    emitCardResolution(state, events, cardId, "땅볼 병살 적용");
    finishPlateAppearance(state, events, doublePlayOutcome(state.bases));
    return;
  }
  if (cardId === "GBH") {
    emitCardResolution(state, events, cardId, "주자 묶어두기 적용");
    finishPlateAppearance(state, events, {
      summary: "주자 묶어두기",
      bases: { ...state.bases },
      outsRecorded: 1,
      moves: [{ runner: "batter", from: "batter", to: "out" }],
    });
  }
}

function resolveCardPair(
  state: GameState,
  primary: NonNullable<GameState["cardWindow"]>["respondingTo"],
  response: NonNullable<GameState["cardWindow"]>["respondingTo"],
  events: GameEvent[],
) {
  if (!primary || !response) return;
  if (response.cardId === "POE") {
    applyAllRunnerAdvance(
      state,
      events,
      "견제 송구 실책 · 모든 주자 진루",
      response.cardId,
    );
    continueCardWindow(state, events);
    return;
  }
  if (["CS2", "CS3", "CSH"].includes(response.cardId)) {
    const base =
      primary.cardId === "SB2"
        ? "first"
        : primary.cardId === "SB3"
          ? "second"
          : "third";
    recordRunnerOut(
      state,
      base,
      events,
      `${CARD_DEFINITIONS[response.cardId].name} 성공`,
      response.cardId,
    );
    continueCardWindow(state, events);
    return;
  }
  if (response.cardId === "BD") {
    emitCardResolution(state, events, response.cardId, "번트 수비 적용");
    finishPlateAppearance(state, events, buntDefenseOutcome(state.bases));
    return;
  }
  if (response.cardId === "E") {
    emitCardResolution(state, events, response.cardId, "수비 실책 적용");
    finishPlateAppearance(state, events, errorOutcome(state.bases));
  }
}

function emitCardResolution(
  state: GameState,
  events: GameEvent[],
  cardId: CardId,
  summary: string,
) {
  emit(state, events, {
    kind: "card_resolve",
    summary,
    cardId,
    cardRole: CARD_DEFINITIONS[cardId].role,
  });
}

function continueCardWindow(state: GameState, events: GameEvent[]) {
  if (state.phase === "finished") return;
  if (state.cardWindow && state.phase === "awaiting_card") {
    const timing = state.cardWindow.timing;
    const order = [...state.cardWindow.priorityOrder];
    if (openCardWindow(state, timing, order)) return;
    closeCardWindow(state, events);
  }
}

function closeCardWindow(state: GameState, events: GameEvent[]) {
  state.cardWindow = null;
  if (state.pendingResolution) {
    resolvePending(state, events);
  } else {
    state.phase = "awaiting_pitch";
  }
}

function resolvePending(state: GameState, events: GameEvent[]) {
  const pending = state.pendingResolution;
  state.pendingResolution = null;
  state.cardWindow = null;
  if (!pending) {
    state.phase = "awaiting_pitch";
    return;
  }
  if (pending.kind === "pitch") {
    state.phase = "awaiting_pitch";
    resolvePitchFace(state, pending.face, events);
    return;
  }
  if (pending.kind === "contact") {
    state.phase = "awaiting_batting";
    emit(state, events, {
      kind: "count",
      summary: "컨택 · 타격 주사위를 굴립니다.",
    });
    return;
  }
  state.phase = "awaiting_batting";
  resolveBattingFace(state, pending.face, events);
}

function applyAllRunnerAdvance(
  state: GameState,
  events: GameEvent[],
  summary: string,
  cardId: CardId,
) {
  const before = { ...state.bases };
  const runs = before.third ? 1 : 0;
  const moves = moveExistingRunnersOneBase(before);
  state.bases = {
    first: false,
    second: before.first,
    third: before.second,
  };
  state.score[state.battingTeam] += runs;
  emit(state, events, {
    kind: "card_resolve",
    summary,
    cardId,
    runs,
    moves,
  });
  if (isWalkOff(state)) finishGame(state, "home", events, "홈팀 끝내기 승리");
}

function recordRunnerOut(
  state: GameState,
  base: "first" | "second" | "third",
  events: GameEvent[],
  summary: string,
  cardId: CardId,
) {
  state.bases[base] = false;
  emit(state, events, {
    kind: "card_resolve",
    summary,
    cardId,
    outsRecorded: 1,
    moves: [{ runner: base, from: base, to: "out" }],
  });
  if (state.outs === 2) {
    advanceHalfInning(state, events);
  } else {
    state.outs = (state.outs + 1) as GameState["outs"];
  }
}

function resolveSuccessfulSteal(
  state: GameState,
  cardId: "SB2" | "SB3" | "SBH",
  events: GameEvent[],
) {
  const from =
    cardId === "SB2" ? "first" : cardId === "SB3" ? "second" : "third";
  const to = cardId === "SB2" ? "second" : cardId === "SB3" ? "third" : "home";
  state.bases[from] = false;
  if (to !== "home") state.bases[to] = true;
  const runs = to === "home" ? 1 : 0;
  state.score[state.battingTeam] += runs;
  emit(state, events, {
    kind: "card_resolve",
    summary: `${CARD_DEFINITIONS[cardId].name} 성공`,
    cardId,
    runs,
    moves: [{ runner: from, from, to }],
  });
  if (isWalkOff(state)) finishGame(state, "home", events, "홈팀 끝내기 승리");
}

function sacrificeBuntOutcome(bases: Bases): PlateAppearanceOutcome {
  return {
    ...resolveGroundAdvance(bases),
    summary: "희생번트 성공",
  };
}

function errorOutcome(bases: Bases): PlateAppearanceOutcome {
  return {
    summary: "수비 실책 · 전원 세이프",
    bases: { first: true, second: bases.first, third: bases.second },
    runs: bases.third ? 1 : 0,
    moves: [
      ...moveExistingRunnersOneBase(bases),
      { runner: "batter", from: "batter", to: "first" },
    ],
  };
}

function doublePlayOutcome(bases: Bases): PlateAppearanceOutcome {
  const forcedOut = bases.third ? "third" : bases.second ? "second" : "first";
  return {
    summary: "땅볼 병살",
    bases: { ...bases, [forcedOut]: false },
    outsRecorded: 2,
    moves: [
      { runner: forcedOut, from: forcedOut, to: "out" },
      { runner: "batter", from: "batter", to: "out" },
    ],
  };
}

function buntDefenseOutcome(bases: Bases): PlateAppearanceOutcome {
  const lead = bases.second ? "second" : "first";
  const nextBases: Bases = { first: true, second: false, third: false };
  const moves: RunnerMove[] = [
    { runner: lead, from: lead, to: "out" },
    { runner: "batter", from: "batter", to: "first" },
  ];
  if (lead === "second" && bases.first) {
    nextBases.second = true;
    moves.push({ runner: "first", from: "first", to: "second" });
  }
  return {
    summary: "번트 수비 성공",
    bases: nextBases,
    outsRecorded: 1,
    moves,
  };
}

function createCardZone(role: CardRole, rng: GameState["rng"]): CardZone {
  const cards = CARD_DECK_COUNTS[role].flatMap((cardId) =>
    Array.from({ length: CARD_DEFINITIONS[cardId].copies }, (_, index) => ({
      instanceId: `${role}-${cardId}-${index + 1}`,
      cardId,
    })),
  );
  return { drawPile: shuffle(cards, rng), hand: [], discardPile: [] };
}

function spendCard(state: GameState, role: CardRole, card: CardInstance) {
  const zone = state.cards[role];
  zone.hand = zone.hand.filter(
    (instance) => instance.instanceId !== card.instanceId,
  );
  zone.discardPile.push(card);
  drawToFour(zone, state.rng);
}

function drawToFour(zone: CardZone, rng: GameState["rng"]) {
  while (zone.hand.length < 4) {
    if (zone.drawPile.length === 0) {
      if (zone.discardPile.length === 0) return;
      zone.drawPile = shuffle(zone.discardPile, rng);
      zone.discardPile = [];
    }
    const card = zone.drawPile.pop();
    if (card) zone.hand.push(card);
  }
}

function resetHandsForHalfInning(state: GameState) {
  state.cardWindow = null;
  state.pendingResolution = null;
  state.phase = "awaiting_pitch";
  for (const role of ["offense", "defense"] as const) {
    const zone = state.cards[role];
    zone.discardPile.push(...zone.hand);
    zone.hand = [];
    drawToFour(zone, state.rng);
  }
}

function shuffle<T>(items: T[], rng: GameState["rng"]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(nextRandom(rng) * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

function nextRandom(rng: GameState["rng"]) {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let value = rng.state;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
}

function normalizeSeed(seed: number) {
  if (!Number.isFinite(seed)) return DEFAULT_SEED;
  return Math.trunc(seed) >>> 0;
}

function cloneCardZone(zone: CardZone): CardZone {
  return {
    drawPile: zone.drawPile.map((card) => ({ ...card })),
    hand: zone.hand.map((card) => ({ ...card })),
    discardPile: zone.discardPile.map((card) => ({ ...card })),
  };
}

function cardZoneView(zone: CardZone, reveal: boolean) {
  return {
    handCount: zone.hand.length,
    drawCount: zone.drawPile.length,
    discardCount: zone.discardPile.length,
    hand: reveal ? zone.hand.map((card) => ({ ...card })) : null,
  };
}

function oppositeRole(role: CardRole): CardRole {
  return role === "offense" ? "defense" : "offense";
}

function oppositeTeam(team: TeamSide): TeamSide {
  return team === "away" ? "home" : "away";
}

function teamForRole(state: GameState, role: CardRole): TeamSide {
  return role === "offense"
    ? state.battingTeam
    : oppositeTeam(state.battingTeam);
}

function finishGame(
  state: GameState,
  winner: TeamSide,
  events: GameEvent[],
  summary: string,
) {
  state.phase = "finished";
  state.winner = winner;
  state.cardWindow = null;
  state.pendingResolution = null;
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
