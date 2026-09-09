import { BATTING_DIE_FACES, HIT_DIE_FACES, PITCH_DIE_FACES } from "./rules";
import { CARD_DECK_COUNTS, CARD_DEFINITIONS } from "./cards";
import {
  createActualPitchLocation,
  createPitchHint,
  PITCH_TARGET_LABELS,
  PITCH_TARGETS,
  resolveBattedBall,
  resolveDuelWinner,
  resolveHitOutcome,
  resolvePitchFace as resolveDuelPitchFace,
} from "./duel";
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
  type PitchHint,
  type PitchLocation,
  type PitchTarget,
  type RuleError,
  type RunnerMove,
  type ScoringRecord,
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
  scoring?: Partial<ScoringRecord>;
};

const PHASE_ACTION: Record<
  Exclude<GamePhase, "finished" | "awaiting_card">,
  GameAction["type"]
> = {
  awaiting_pitch: "SELECT_PITCH",
  awaiting_swing: "SELECT_SWING",
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

  const state: GameState = {
    schemaVersion: 6,
    rulesetVersion: "pitch-duel-v2",
    presentationVersion: "broadcast-v2",
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
    boxScore: {
      innings: [{ away: 0, home: null }],
      totals: {
        away: { hits: 0, errors: 0, freePasses: 0 },
        home: { hits: 0, errors: 0, freePasses: 0 },
      },
    },
    winner: null,
    rng,
    cards,
    cardWindow: null,
    pendingResolution: null,
    activeStrategy: null,
    pitchDuel: null,
    eventLog: [],
  };
  openCardWindow(state, "before_pitch", ["offense", "defense"]);
  return state;
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
    : state.phase === "awaiting_swing"
      ? state.battingTeam
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
  const {
    cards: privateCards,
    rng: privateRng,
    pitchDuel: privatePitchDuel,
    ...publicState
  } = cloned;
  void privateCards;
  void privateRng;
  void privatePitchDuel;
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
    pitchDuel: pitchDuelView(state, viewer),
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
  } else if (action.type === "SELECT_PITCH") {
    selectPitch(next, action.target, events);
  } else if (action.type === "SELECT_SWING") {
    selectSwing(next, action.decision, events);
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

  continueDuelAutomation(next, events);

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
  const legacyResolution =
    (state.phase === "awaiting_pitch" && action.type === "PITCH_RESULT") ||
    (state.phase === "awaiting_batting" && action.type === "BATTING_RESULT") ||
    (state.phase === "awaiting_hit" && action.type === "HIT_RESULT");
  if (action.type !== expectedAction && !legacyResolution) {
    return wrongPhase(expectedAction);
  }

  if (action.type === "SELECT_PITCH") {
    return PITCH_TARGETS.includes(action.target)
      ? null
      : {
          code: "INVALID_FACE",
          message: "선택할 수 없는 투구 위치입니다.",
          expectedAction,
        };
  }
  if (action.type === "SELECT_SWING") {
    return action.decision === "swing" || action.decision === "take"
      ? null
      : {
          code: "INVALID_FACE",
          message: "선택할 수 없는 타격 판단입니다.",
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

function wrongPhase(expectedAction: GameAction["type"]): RuleError {
  return {
    code: "WRONG_PHASE",
    message: `현재 단계에서는 ${expectedAction} 행동이 필요합니다.`,
    expectedAction,
  };
}

function cloneState(state: GameState): GameState {
  const boxScore = state.boxScore ?? createLegacyBoxScore(state);
  return {
    ...state,
    config: { ...state.config },
    bases: { ...state.bases },
    score: { ...state.score },
    boxScore: {
      innings: boxScore.innings.map((inning) => ({ ...inning })),
      totals: {
        away: { ...boxScore.totals.away },
        home: { ...boxScore.totals.home },
      },
    },
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
      ? state.pendingResolution.kind === "run_hit_pitch"
        ? {
            ...state.pendingResolution,
            runners: [...state.pendingResolution.runners],
          }
        : { ...state.pendingResolution }
      : null,
    activeStrategy: state.activeStrategy ? { ...state.activeStrategy } : null,
    pitchDuel: state.pitchDuel
      ? {
          ...state.pitchDuel,
          hint: { ...state.pitchDuel.hint },
          actualLocation: state.pitchDuel.actualLocation
            ? { ...state.pitchDuel.actualLocation }
            : null,
        }
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
    scoring?: ScoringRecord;
    pitchTarget?: PitchTarget;
    swingDecision?: GameEvent["swingDecision"];
    pitchLocation?: PitchLocation;
    pitchHint?: PitchHint;
    duelWinner?: GameEvent["duelWinner"];
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
    scoring: event.scoring,
    pitchTarget: event.pitchTarget,
    swingDecision: event.swingDecision,
    pitchLocation: event.pitchLocation,
    pitchHint: event.pitchHint,
    duelWinner: event.duelWinner,
  });
}

function createLegacyBoxScore(state: GameState): GameState["boxScore"] {
  const innings: GameState["boxScore"]["innings"] = Array.from(
    { length: Math.max(1, state.inning) },
    (_, index) => ({
      away: index === state.inning - 1 ? state.score.away : 0,
      home: index === state.inning - 1 ? state.score.home : 0,
    }),
  );
  if (state.half === "top" && state.score.home === 0) {
    innings[state.inning - 1].home = null;
  }
  return {
    innings,
    totals: {
      away: { hits: 0, errors: 0, freePasses: 0 },
      home: { hits: 0, errors: 0, freePasses: 0 },
    },
  };
}

function ensureInningScore(state: GameState, inning = state.inning) {
  while (state.boxScore.innings.length < inning) {
    state.boxScore.innings.push({ away: 0, home: null });
  }
  return state.boxScore.innings[inning - 1];
}

function recordRuns(state: GameState, runs: number) {
  if (runs <= 0) return;
  state.score[state.battingTeam] += runs;
  const inning = ensureInningScore(state);
  inning[state.battingTeam] = (inning[state.battingTeam] ?? 0) + runs;
}

function normalizeScoring(
  scoring: Partial<ScoringRecord> | undefined,
): ScoringRecord {
  return {
    hit: scoring?.hit ?? false,
    error: scoring?.error ?? false,
    freePass: scoring?.freePass ?? false,
  };
}

function recordScoring(state: GameState, scoring: ScoringRecord) {
  if (scoring.hit) state.boxScore.totals[state.battingTeam].hits += 1;
  if (scoring.freePass)
    state.boxScore.totals[state.battingTeam].freePasses += 1;
  if (scoring.error)
    state.boxScore.totals[oppositeTeam(state.battingTeam)].errors += 1;
}

function selectPitch(
  state: GameState,
  target: PitchTarget,
  events: GameEvent[],
) {
  const pitchNumber = currentPlateAppearancePitchCount(state.eventLog) + 1;
  const actualLocation = createActualPitchLocation(target, pitchNumber, () =>
    nextRandom(state.rng),
  );
  const hint = createPitchHint(target, actualLocation, () =>
    nextRandom(state.rng),
  );
  state.pitchDuel = {
    sequence: pitchNumber,
    status: "pitch_locked",
    pitcherChoice: target,
    hint,
    batterDecision: null,
    duelWinner: null,
    actualLocation,
    result: null,
  };
  state.phase = "awaiting_swing";
  emit(state, events, {
    kind: "pitch_commit",
    summary: "투수가 코스를 선택했습니다.",
  });

  if (state.activeStrategy?.cardId === "HNR") {
    revealPitchDuel(state, "swing", "C", actualLocation, events);
    resolvePitch(state, "C", events);
  }
}

function selectSwing(
  state: GameState,
  decision: "swing" | "take",
  events: GameEvent[],
) {
  const duel = state.pitchDuel;
  if (!duel) return;
  const actualLocation = duel.actualLocation;
  if (!actualLocation) return;
  const face = resolveDuelPitchFace(duel.pitcherChoice, decision, () =>
    nextRandom(state.rng),
  );
  revealPitchDuel(state, decision, face, actualLocation, events);
  resolvePitch(state, face, events);
}

function revealPitchDuel(
  state: GameState,
  decision: "swing" | "take",
  face: PitchFace,
  actualLocation: PitchLocation,
  events: GameEvent[],
) {
  const duel = state.pitchDuel;
  if (!duel) return;
  duel.status = "revealed";
  duel.batterDecision = decision;
  duel.duelWinner = resolveDuelWinner(duel.pitcherChoice, decision);
  duel.actualLocation = actualLocation;
  duel.result = face;
  emit(state, events, {
    kind: "pitch_result",
    summary: `${PITCH_TARGET_LABELS[duel.pitcherChoice]} · ${decision === "swing" ? "스윙" : "지켜보기"} · ${duel.duelWinner === "batter" ? "타자 승부 성공" : "투수 승부 성공"} · ${pitchFaceSummary(face)}`,
    face,
    pitchTarget: duel.pitcherChoice,
    swingDecision: decision,
    pitchLocation: actualLocation,
    pitchHint: { ...duel.hint },
    duelWinner: duel.duelWinner,
  });
}

function continueDuelAutomation(state: GameState, events: GameEvent[]) {
  let guard = 0;
  while (
    state.pitchDuel?.status === "revealed" &&
    state.phase !== "awaiting_card" &&
    state.phase !== "awaiting_pitch" &&
    state.phase !== "awaiting_swing" &&
    state.phase !== "finished" &&
    guard < 4
  ) {
    guard += 1;
    if (state.phase === "awaiting_batting") {
      const face = resolveBattedBall(
        state.pitchDuel.pitcherChoice,
        () => nextRandom(state.rng),
        state.pitchDuel.duelWinner ?? null,
      );
      emit(state, events, {
        kind: "batted_ball",
        summary: `타구 판정 · ${face}`,
        face,
      });
      resolveBatting(state, face, events);
      continue;
    }
    if (state.phase === "awaiting_hit") {
      const face = resolveHitOutcome(() => nextRandom(state.rng));
      emit(state, events, {
        kind: "batted_ball",
        summary: `안타 판정 · ${face}`,
        face,
      });
      resolveHit(state, face, events);
      continue;
    }
    break;
  }
}

function currentPlateAppearancePitchCount(events: GameEvent[]) {
  let count = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.kind === "plate_appearance") break;
    if (event.kind === "pitch_result") count += 1;
  }
  return count;
}

function pitchFaceSummary(face: PitchFace) {
  if (face === "B") return "볼";
  if (face === "S") return "스트라이크";
  if (face === "SM") return "헛스윙";
  if (face === "F") return "파울";
  return "컨택";
}

function resolvePitch(state: GameState, face: PitchFace, events: GameEvent[]) {
  if (state.activeStrategy?.cardId === "RNH") {
    resolveRunAndHitPitch(state, face, events);
    return;
  }

  if (face === "C") {
    state.pendingResolution = { kind: "contact" };
    if (openCardWindow(state, "after_contact", ["offense"])) return;
    resolvePending(state, events);
    return;
  }

  if (face === "S" || face === "SM" || face === "B" || face === "F") {
    state.pendingResolution = { kind: "pitch", face };
    if (openCardWindow(state, "after_pitch", ["offense", "defense"])) return;
    resolvePending(state, events);
    return;
  }

  resolvePitchFace(state, face, events);
}

function resolveRunAndHitPitch(
  state: GameState,
  face: PitchFace,
  events: GameEvent[],
) {
  if (face === "F") {
    returnRunAndHitCard(state);
    state.activeStrategy = null;
    emit(state, events, {
      kind: "rule",
      summary: "런 앤드 히트 · 파울로 카드 반환, 주자 원위치",
      cardId: "RNH",
      cardRole: "offense",
    });
    resolvePitchFace(state, face, events);
    return;
  }

  if (face === "C") {
    state.pendingResolution = null;
    state.phase = "awaiting_batting";
    emit(state, events, {
      kind: "rule",
      summary: "런 앤드 히트 · 컨택, 특수 타구 규칙 적용",
      cardId: "RNH",
      cardRole: "offense",
    });
    return;
  }

  const runners: Array<"first" | "second"> = [];
  if (state.bases.second) runners.push("second");
  if (state.bases.first) runners.push("first");
  state.pendingResolution = { kind: "run_hit_pitch", face, runners };
  if (openCardWindow(state, "after_pitch", ["defense"])) return;
  resolvePending(state, events);
}

function returnRunAndHitCard(state: GameState) {
  const instanceId = state.activeStrategy?.cardInstanceId;
  if (!instanceId) return;
  const zone = state.cards.offense;
  const card = zone.discardPile.find((item) => item.instanceId === instanceId);
  if (!card) return;
  zone.discardPile = zone.discardPile.filter(
    (item) => item.instanceId !== instanceId,
  );
  const replacement = zone.hand.pop();
  if (replacement) zone.drawPile.push(replacement);
  zone.hand.push(card);
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
      summary: "컨택 · 타구를 판정합니다.",
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

  return {
    summary: "볼넷",
    bases: nextBases,
    runs,
    moves,
    scoring: { freePass: true },
  };
}

function resolveBatting(
  state: GameState,
  face: BattingFace,
  events: GameEvent[],
) {
  state.pendingResolution = { kind: "batting", face };
  if (openCardWindow(state, "after_batting", ["defense", "offense"])) {
    return;
  }
  resolvePending(state, events);
}

function resolveBattingFace(
  state: GameState,
  face: BattingFace,
  events: GameEvent[],
) {
  if (face === "HIT") {
    state.phase = "awaiting_hit";
    emit(state, events, {
      kind: "count",
      summary: "안타 진루를 판정합니다.",
    });
    return;
  }

  const strategy = state.activeStrategy?.cardId;
  if (strategy && (face === "GF" || face === "G3")) {
    finishPlateAppearance(state, events, {
      ...resolveGroundAdvance(state.bases),
      summary: `${strategy} · 땅볼 진루타`,
    });
    return;
  }
  if (strategy && (face === "PO" || face === "FO")) {
    finishPlateAppearance(
      state,
      events,
      lineDriveDoublePlayOutcome(state.bases, `${strategy} · 뜬공 병살`),
    );
    return;
  }
  if (strategy && (face === "F2" || face === "F3" || face === "FA")) {
    finishPlateAppearance(state, events, {
      ...resolveFlyHold(state.bases, "FO"),
      summary: `${strategy} · 주자 복귀, 타자 아웃`,
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
    scoring: { hit: true },
  };
}

function resolveHit(state: GameState, face: HitFace, events: GameEvent[]) {
  state.pendingResolution = { kind: "hit", face };
  if (openCardWindow(state, "after_hit", ["defense", "offense"])) return;
  resolvePending(state, events);
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
      scoring: { hit: true },
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
      scoring: { hit: true },
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
      scoring: { hit: true },
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
      scoring: { hit: true },
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
      scoring: { hit: true },
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
    scoring: { hit: true },
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
  const scoring = normalizeScoring(outcome.scoring);

  recordScoring(state, scoring);

  if (!thirdOut) {
    state.bases = { ...outcome.bases };
    state.outs = (state.outs + outsRecorded) as GameState["outs"];
    recordRuns(state, runs);
  }

  resetCount(state);
  state.activeStrategy = null;
  state.phase = "awaiting_pitch";
  emit(state, events, {
    kind: "plate_appearance",
    summary: thirdOut
      ? `${outcome.summary} · 3아웃${cancelledRunnerAdvance ? ", 진루와 득점 취소" : ""}`
      : outcome.summary,
    runs,
    outsRecorded,
    moves,
    scoring,
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
  state.activeStrategy = null;
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
    ensureInningScore(state).home ??= 0;
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
  ensureInningScore(state);
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
  state.pitchDuel = null;
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
  if (pending.kind === "pitch" || pending.kind === "run_hit_pitch") {
    return "awaiting_pitch";
  }
  return pending.kind === "hit" ? "awaiting_hit" : "awaiting_batting";
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

  const pending = state.pendingResolution;
  const pitchFace = pending?.kind === "pitch" ? pending.face : null;
  const battingFace = pending?.kind === "batting" ? pending.face : null;
  const hitFace = pending?.kind === "hit" ? pending.face : null;

  if (window.timing === "before_pitch") {
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
    if (cardId === "HNR" || cardId === "RNH") {
      if (!state.bases.first || state.bases.third) {
        return "1루 또는 1·2루 상황이 필요합니다.";
      }
      if (cardId === "RNH" && state.balls !== 3)
        return "3볼 상황이 필요합니다.";
      return state.activeStrategy ? "이미 주루 작전이 진행 중입니다." : null;
    }
  }

  if (window.timing === "after_pitch") {
    if (pending?.kind === "run_hit_pitch") {
      if (cardId === "CS2") {
        return pending.runners.includes("first")
          ? null
          : "2루 도루 주자가 없습니다.";
      }
      if (cardId === "CS3") {
        return pending.runners.includes("second")
          ? null
          : "3루 도루 주자가 없습니다.";
      }
      return "런 앤드 히트 도루저지 카드만 사용할 수 있습니다.";
    }
    if (cardId === "HBP")
      return pitchFace === "B" ? null : "볼 결과가 필요합니다.";
    if (cardId === "WP") {
      if (pitchFace !== "B") return "볼 결과가 필요합니다.";
      return occupiedBaseCount(state.bases) > 0 ? null : "주자가 없습니다.";
    }
    if (cardId === "SNO") {
      return pitchFace === "SM" &&
        state.strikes === 2 &&
        (!state.bases.first || state.outs === 2)
        ? null
        : "세 번째 헛스윙과 낫아웃 조건이 필요합니다.";
    }
    if (cardId === "CIB")
      return pitchFace === "SM" ? null : "헛스윙 결과가 필요합니다.";
    if (cardId === "CO1") {
      return pitchFace &&
        ["S", "SM", "B"].includes(pitchFace) &&
        state.bases.first
        ? null
        : "투구 직후 1루 주자가 필요합니다.";
    }
    if (cardId === "CO3") {
      return pitchFace &&
        ["S", "SM", "B"].includes(pitchFace) &&
        state.bases.third
        ? null
        : "투구 직후 3루 주자가 필요합니다.";
    }
    if (cardId === "FFO")
      return pitchFace === "F" ? null : "파울 결과가 필요합니다.";
    if (!pitchFace || !["S", "SM", "B"].includes(pitchFace)) {
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
    if (cardId === "SBH")
      return state.bases.third ? null : "3루 주자가 필요합니다.";
  }

  if (window.timing === "after_contact") {
    if (cardId === "SB") {
      return !state.bases.third && (state.bases.first || state.bases.second)
        ? null
        : "1루·2루 또는 1·2루 주자 상황이 필요합니다.";
    }
    if (cardId === "SQ1" || cardId === "SQ2") {
      return state.bases.third ? null : "3루 주자가 필요합니다.";
    }
  }

  if (window.timing === "after_batting") {
    if (cardId === "GDP") {
      const supportedBases =
        state.bases.first && (!state.bases.third || state.bases.second);
      return !state.activeStrategy &&
        state.outs < 2 &&
        supportedBases &&
        (battingFace === "GF" || battingFace === "GA")
        ? null
        : "0·1아웃의 지정된 강제 상황과 GF·GA가 필요합니다.";
    }
    if (cardId === "GTP") {
      return !state.activeStrategy &&
        state.outs === 0 &&
        state.bases.first &&
        state.bases.second &&
        battingFace === "GF"
        ? null
        : "무사 1·2루 또는 만루의 GF가 필요합니다.";
    }
    if (cardId === "LDP") {
      return state.outs < 2 &&
        occupiedBaseCount(state.bases) > 0 &&
        battingFace === "HIT"
        ? null
        : "0·1아웃, 주자가 있는 안타성 타구가 필요합니다.";
    }
    if (cardId === "GBH") {
      return battingFace === "GA" &&
        !state.bases.first &&
        (state.bases.second || state.bases.third)
        ? null
        : "1루 주자 없이 2·3루 주자와 GA가 필요합니다.";
    }
    if (cardId === "A3F") {
      return (battingFace === "F2" || battingFace === "FA") &&
        state.bases.second
        ? null
        : "2루 주자의 3루 태그업이 필요합니다.";
    }
    if (cardId === "AHF") {
      return (battingFace === "F3" || battingFace === "FA") && state.bases.third
        ? null
        : "3루 주자의 홈 태그업이 필요합니다.";
    }
    if (cardId === "IFD") {
      return battingFace === "PO" &&
        state.outs < 2 &&
        state.bases.first &&
        !isInfieldFlySituation(state)
        ? null
        : "인필드플라이가 아닌 0·1아웃 1루 강제 상황이 필요합니다.";
    }
    if (cardId === "RHB") {
      return (battingFace === "GF" || battingFace === "GA") &&
        (state.bases.first || state.bases.second)
        ? null
        : "1·2루 주자가 있는 GF 또는 GA가 필요합니다.";
    }
    if (cardId === "E") {
      return battingFace &&
        ["GF", "G3", "GA", "PO", "FO", "F2", "F3", "FA"].includes(battingFace)
        ? null
        : "땅볼 또는 플라이 결과가 필요합니다.";
    }
    if (cardId === "HRC")
      return battingFace === "HR" ? null : "홈런 결과가 필요합니다.";
    if (cardId === "IOB") {
      return battingFace &&
        ["GF", "GA", "PO"].includes(battingFace) &&
        occupiedBaseCount(state.bases) > 0
        ? null
        : "주자가 있는 GF·GA·PO 결과가 필요합니다.";
    }
  }

  if (window.timing === "after_hit") {
    if (cardId === "1H1E") return hitFace ? null : "안타 결과가 필요합니다.";
    if (cardId === "A2")
      return hitFace === "D2" || hitFace === "D3"
        ? null
        : "D2 또는 D3 2루타가 필요합니다.";
    if (cardId === "A3H") {
      return state.bases.first &&
        hitFace &&
        ["L2", "C2", "R2", "D2"].includes(hitFace)
        ? null
        : "1루 주자가 3루를 노리는 안타가 필요합니다.";
    }
    if (cardId === "AHH") {
      return state.bases.second &&
        hitFace &&
        ["L2", "C2", "R2"].includes(hitFace)
        ? null
        : "2루 주자가 홈을 노리는 안타가 필요합니다.";
    }
  }

  if (cardId === "POE" || cardId.startsWith("CS") || cardId === "BD") {
    return "대응할 상대 카드가 필요합니다.";
  }
  return "현재 상황에서 사용할 수 없습니다.";
}

function responseUnavailableReason(cardId: CardId, primary: CardId) {
  const matchingResponse: Partial<Record<CardId, CardId[]>> = {
    PO1: ["POE"],
    PO2: ["POE"],
    CO1: ["POE"],
    CO3: ["POE"],
    SB2: ["CS2"],
    SB3: ["CS3"],
    SBH: ["CSH"],
    SB: ["BD"],
    SQ1: ["BD"],
    SQ2: ["BD"],
    GDP: ["E"],
    GBH: ["E"],
    GTP: ["E"],
  };
  return matchingResponse[primary]?.includes(cardId)
    ? null
    : `${primary}에 대응할 수 없는 카드입니다.`;
}

function timingReason(timing: CardTiming) {
  const labels: Record<CardTiming, string> = {
    before_pitch: "투구 전 카드만 사용할 수 있습니다.",
    after_pitch: "현재 투구 결과에 맞는 카드만 사용할 수 있습니다.",
    after_contact: "컨택 이후 카드만 사용할 수 있습니다.",
    after_batting: "현재 타구 결과에 맞는 카드만 사용할 수 있습니다.",
    after_hit: "현재 안타와 주자 이동에 맞는 카드만 사용할 수 있습니다.",
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
  if (cardId === "HNR" || cardId === "RNH") {
    state.activeStrategy = {
      cardId,
      cardInstanceId: played.instanceId,
    };
    state.cardWindow = null;
    state.pendingResolution = null;
    state.phase = "awaiting_pitch";
    emitCardResolution(
      state,
      events,
      cardId,
      cardId === "HNR"
        ? "히트 앤드 런 · 컨택 확정"
        : "런 앤드 히트 · 다음 투구에 주자 출발",
    );
    return;
  }
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
  if (
    cardId === "PO1" ||
    cardId === "PO2" ||
    cardId === "CO1" ||
    cardId === "CO3"
  ) {
    recordRunnerOut(
      state,
      cardId === "PO1" || cardId === "CO1"
        ? "first"
        : cardId === "CO3"
          ? "third"
          : "second",
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
  if (cardId === "SNO" || cardId === "CIB") {
    emitCardResolution(
      state,
      events,
      cardId,
      `${CARD_DEFINITIONS[cardId].name} 적용`,
    );
    finishPlateAppearance(state, events, {
      ...errorOutcome(state.bases),
      summary: CARD_DEFINITIONS[cardId].name,
    });
    return;
  }
  if (
    (cardId === "CS2" || cardId === "CS3") &&
    state.pendingResolution?.kind === "run_hit_pitch"
  ) {
    const base = cardId === "CS2" ? "first" : "second";
    state.pendingResolution.runners = state.pendingResolution.runners.filter(
      (runner) => runner !== base,
    );
    recordRunnerOut(
      state,
      base,
      events,
      `${CARD_DEFINITIONS[cardId].name} 성공`,
      cardId,
    );
    continueCardWindow(state, events);
    return;
  }
  if (cardId === "FFO") {
    emitCardResolution(state, events, cardId, "파울 플라이 아웃 적용");
    finishPlateAppearance(state, events, {
      ...resolveFlyHold(state.bases, "PO"),
      summary: "파울 플라이 아웃",
    });
    return;
  }
  if (cardId === "SB2" || cardId === "SB3" || cardId === "SBH") {
    resolveSuccessfulSteal(state, cardId, events);
    continueCardWindow(state, events);
    return;
  }
  if (cardId === "SB" || cardId === "SQ1" || cardId === "SQ2") {
    emitCardResolution(
      state,
      events,
      cardId,
      `${CARD_DEFINITIONS[cardId].name} 적용`,
    );
    const outcome =
      cardId === "SB"
        ? sacrificeBuntOutcome(state.bases)
        : squeezeOutcome(state.bases, cardId === "SQ2");
    finishPlateAppearance(state, events, outcome);
    return;
  }
  if (cardId === "E") {
    emitCardResolution(state, events, cardId, "수비 실책 적용");
    finishPlateAppearance(state, events, {
      ...errorOutcome(state.bases),
      scoring: { error: true },
    });
    return;
  }
  if (cardId === "GDP" || cardId === "IFD") {
    emitCardResolution(
      state,
      events,
      cardId,
      `${CARD_DEFINITIONS[cardId].name} 적용`,
    );
    finishPlateAppearance(state, events, doublePlayOutcome(state.bases));
    return;
  }
  if (cardId === "GTP") {
    emitCardResolution(state, events, cardId, "땅볼 삼중살 적용");
    finishPlateAppearance(state, events, triplePlayOutcome(state.bases));
    return;
  }
  if (cardId === "LDP") {
    emitCardResolution(state, events, cardId, "직선타 병살 적용");
    finishPlateAppearance(
      state,
      events,
      lineDriveDoublePlayOutcome(state.bases),
    );
    return;
  }
  if (cardId === "RHB") {
    emitCardResolution(state, events, cardId, "타구에 맞은 주자 아웃");
    finishPlateAppearance(state, events, runnerHitByBallOutcome(state.bases));
    return;
  }
  if (cardId === "A3F" || cardId === "AHF") {
    const face =
      state.pendingResolution?.kind === "batting"
        ? state.pendingResolution.face
        : null;
    if (face !== "F2" && face !== "F3" && face !== "FA") return;
    emitCardResolution(
      state,
      events,
      cardId,
      `${CARD_DEFINITIONS[cardId].name} 적용`,
    );
    finishPlateAppearance(
      state,
      events,
      flyAssistOutcome(state.bases, face, cardId),
    );
    return;
  }
  if (cardId === "HRC") {
    emitCardResolution(state, events, cardId, "중월 홈런 확정");
    finishPlateAppearance(state, events, resolveHomeRun(state.bases));
    return;
  }
  if (cardId === "IOB") {
    emitCardResolution(state, events, cardId, "야수 주루방해 적용");
    finishPlateAppearance(state, events, {
      ...errorOutcome(state.bases),
      summary: "야수 주루방해 · 안전진루",
    });
    return;
  }
  if (cardId === "1H1E") {
    const face =
      state.pendingResolution?.kind === "hit"
        ? state.pendingResolution.face
        : null;
    if (!face) return;
    emitCardResolution(state, events, cardId, "원히트 원에러 적용");
    finishPlateAppearance(
      state,
      events,
      oneHitOneErrorOutcome(state.bases, face),
    );
    return;
  }
  if (cardId === "A2" || cardId === "A3H" || cardId === "AHH") {
    const face =
      state.pendingResolution?.kind === "hit"
        ? state.pendingResolution.face
        : null;
    if (!face) return;
    emitCardResolution(
      state,
      events,
      cardId,
      `${CARD_DEFINITIONS[cardId].name} 적용`,
    );
    finishPlateAppearance(
      state,
      events,
      hitAssistOutcome(state.bases, face, cardId),
    );
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
      { error: true },
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
    finishPlateAppearance(state, events, {
      ...errorOutcome(state.bases),
      scoring: { error: true },
    });
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
  if (pending.kind === "run_hit_pitch") {
    resolveRunAndHitRunners(state, pending.runners, events);
    if (state.phase === "finished") return;
    state.phase = "awaiting_pitch";
    resolvePitchFace(state, pending.face, events);
    return;
  }
  if (pending.kind === "hit") {
    state.phase = "awaiting_hit";
    const outcome = hitOutcome(state.bases, pending.face);
    finishPlateAppearance(
      state,
      events,
      state.activeStrategy ? addStrategyHitAdvance(outcome) : outcome,
    );
    return;
  }
  state.phase = "awaiting_batting";
  if (pending.face === "PO" && isInfieldFlySituation(state)) {
    emit(state, events, {
      kind: "rule",
      summary: "인필드플라이 선언 · 타자만 아웃",
    });
  }
  resolveBattingFace(state, pending.face, events);
}

function resolveRunAndHitRunners(
  state: GameState,
  runners: Array<"first" | "second">,
  events: GameEvent[],
) {
  const moves: RunnerMove[] = [];
  if (runners.includes("second") && state.bases.second) {
    state.bases.second = false;
    state.bases.third = true;
    moves.push({ runner: "second", from: "second", to: "third" });
  }
  if (runners.includes("first") && state.bases.first) {
    state.bases.first = false;
    state.bases.second = true;
    moves.push({ runner: "first", from: "first", to: "second" });
  }
  emit(state, events, {
    kind: "card_resolve",
    summary: moves.length
      ? "런 앤드 히트 · 주자 출발 성공"
      : "런 앤드 히트 · 주자 저지",
    cardId: "RNH",
    cardRole: "offense",
    moves,
  });
  state.activeStrategy = null;
}

function applyAllRunnerAdvance(
  state: GameState,
  events: GameEvent[],
  summary: string,
  cardId: CardId,
  scoring?: Partial<ScoringRecord>,
) {
  const before = { ...state.bases };
  const runs = before.third ? 1 : 0;
  const moves = moveExistingRunnersOneBase(before);
  state.bases = {
    first: false,
    second: before.first,
    third: before.second,
  };
  recordRuns(state, runs);
  const scoringRecord = normalizeScoring(scoring);
  if (scoring) recordScoring(state, scoringRecord);
  emit(state, events, {
    kind: "card_resolve",
    summary,
    cardId,
    runs,
    moves,
    scoring: scoring ? scoringRecord : undefined,
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
  recordRuns(state, runs);
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

function squeezeOutcome(
  bases: Bases,
  allSafe: boolean,
): PlateAppearanceOutcome {
  if (allSafe) {
    return {
      ...errorOutcome(bases),
      summary: "기습 스퀴즈 · 올 세이프",
    };
  }
  return {
    summary: "스퀴즈 번트 · 득점",
    bases: { ...bases, third: false },
    runs: bases.third ? 1 : 0,
    outsRecorded: 1,
    moves: [
      ...(bases.third
        ? ([{ runner: "third", from: "third", to: "home" }] as RunnerMove[])
        : []),
      { runner: "batter", from: "batter", to: "out" },
    ],
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

function triplePlayOutcome(bases: Bases): PlateAppearanceOutcome {
  const runners = (["third", "second", "first"] as const)
    .filter((base) => bases[base])
    .slice(0, 2);
  return {
    summary: "땅볼 삼중살",
    bases: { ...EMPTY_BASES },
    outsRecorded: 3,
    moves: [
      ...runners.map((runner) => ({
        runner,
        from: runner,
        to: "out" as const,
      })),
      { runner: "batter", from: "batter", to: "out" },
    ],
  };
}

function lineDriveDoublePlayOutcome(
  bases: Bases,
  summary = "직선타 병살",
): PlateAppearanceOutcome {
  const runner = bases.third ? "third" : bases.second ? "second" : "first";
  return {
    summary,
    bases: { ...bases, [runner]: false },
    outsRecorded: 2,
    moves: [
      { runner: "batter", from: "batter", to: "out" },
      { runner, from: runner, to: "out" },
    ],
  };
}

function runnerHitByBallOutcome(bases: Bases): PlateAppearanceOutcome {
  const runner = bases.second ? "second" : "first";
  const firstForced = runner === "second" && bases.first;
  const nextBases = {
    ...bases,
    [runner]: false,
    first: true,
    second: firstForced,
  };
  return {
    summary: "타구에 맞은 주자 아웃 · 타자 세이프",
    bases: nextBases,
    outsRecorded: 1,
    moves: [
      { runner, from: runner, to: "out" },
      ...(firstForced
        ? ([{ runner: "first", from: "first", to: "second" }] as RunnerMove[])
        : []),
      { runner: "batter", from: "batter", to: "first" },
    ],
  };
}

function flyAssistOutcome(
  bases: Bases,
  face: "F2" | "F3" | "FA",
  cardId: "A3F" | "AHF",
): PlateAppearanceOutcome {
  const outcome = resolveTagUp(bases, face);
  const runner = cardId === "A3F" ? "second" : "third";
  const destination = cardId === "A3F" ? "third" : "home";
  const moves = (outcome.moves ?? []).filter((move) => move.runner !== runner);
  moves.push({ runner, from: runner, to: "out" });
  return {
    ...outcome,
    summary: CARD_DEFINITIONS[cardId].name,
    bases:
      cardId === "A3F" ? { ...outcome.bases, third: false } : outcome.bases,
    runs: Math.max(0, (outcome.runs ?? 0) - Number(destination === "home")),
    outsRecorded: 2,
    moves,
  };
}

function hitAssistOutcome(
  bases: Bases,
  face: HitFace,
  cardId: "A2" | "A3H" | "AHH",
): PlateAppearanceOutcome {
  const outcome = hitOutcome(bases, face);
  const runner =
    cardId === "A2" ? "batter" : cardId === "A3H" ? "first" : "second";
  const safeMove = (outcome.moves ?? []).find((move) => move.runner === runner);
  const nextBases = { ...outcome.bases };
  let runs = outcome.runs ?? 0;
  if (
    safeMove?.to === "first" ||
    safeMove?.to === "second" ||
    safeMove?.to === "third"
  ) {
    nextBases[safeMove.to] = false;
  }
  if (safeMove?.to === "home") runs = Math.max(0, runs - 1);
  return {
    ...outcome,
    summary: CARD_DEFINITIONS[cardId].name,
    bases: nextBases,
    runs,
    outsRecorded: 1,
    moves: [
      ...(outcome.moves ?? []).filter((move) => move.runner !== runner),
      { runner, from: runner, to: "out" },
    ],
  };
}

function oneHitOneErrorOutcome(
  bases: Bases,
  face: HitFace,
): PlateAppearanceOutcome {
  const outcome = hitOutcome(bases, face);
  const batterMove = (outcome.moves ?? []).find(
    (move) => move.runner === "batter",
  );
  const nextBases: Bases = { first: false, second: false, third: false };
  const moves: RunnerMove[] = [];
  let runs = 0;

  if (batterMove) {
    moves.push(batterMove);
    if (
      batterMove.to === "first" ||
      batterMove.to === "second" ||
      batterMove.to === "third"
    ) {
      nextBases[batterMove.to] = true;
    } else if (batterMove.to === "home") runs += 1;
  }

  for (const runner of ["third", "second", "first"] as const) {
    if (!bases[runner]) continue;
    const normalMove = (outcome.moves ?? []).find(
      (move) => move.runner === runner,
    );
    const destination = advanceDestination(normalMove?.to ?? runner);
    moves.push({ runner, from: runner, to: destination });
    if (destination === "home") runs += 1;
    else if (destination !== "out") nextBases[destination] = true;
  }

  return {
    summary: "원히트 원에러 · 추가 진루",
    bases: nextBases,
    runs,
    moves,
    scoring: { hit: true, error: true },
  };
}

function addStrategyHitAdvance(
  outcome: PlateAppearanceOutcome,
): PlateAppearanceOutcome {
  const nextBases: Bases = { first: false, second: false, third: false };
  const moves: RunnerMove[] = [];
  let runs = outcome.runs ?? 0;
  for (const move of outcome.moves ?? []) {
    if (move.runner === "batter" || move.to === "out" || move.to === "home") {
      moves.push(move);
      if (move.to === "first" || move.to === "second" || move.to === "third")
        nextBases[move.to] = true;
      continue;
    }
    const destination = advanceDestination(move.to);
    moves.push({ ...move, to: destination });
    if (destination === "home") runs += 1;
    else if (destination !== "out") nextBases[destination] = true;
  }
  return {
    ...outcome,
    summary: `${outcome.summary} · 주자 추가 진루`,
    bases: nextBases,
    runs,
    moves,
  };
}

function advanceDestination(destination: RunnerMove["to"]): RunnerMove["to"] {
  if (destination === "first") return "second";
  if (destination === "second") return "third";
  if (destination === "third") return "home";
  return destination;
}

function buntDefenseOutcome(bases: Bases): PlateAppearanceOutcome {
  const lead = bases.third ? "third" : bases.second ? "second" : "first";
  const nextBases: Bases = { first: true, second: false, third: false };
  const moves: RunnerMove[] = [
    { runner: lead, from: lead, to: "out" },
    { runner: "batter", from: "batter", to: "first" },
  ];
  if ((lead === "second" || lead === "third") && bases.first) {
    nextBases.second = true;
    moves.push({ runner: "first", from: "first", to: "second" });
  }
  if (lead === "third" && bases.second) {
    nextBases.third = true;
    moves.push({ runner: "second", from: "second", to: "third" });
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
  state.activeStrategy = null;
  state.pitchDuel = null;
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

function pitchDuelView(
  state: GameState,
  viewer: GameViewer,
): GameView["pitchDuel"] {
  const duel = state.pitchDuel;
  if (!duel) return null;

  const revealed = duel.status === "revealed";
  const defenseTeam = oppositeTeam(state.battingTeam);
  const canSeeChoice = viewer === "debug" || revealed || viewer === defenseTeam;
  const canSeeHint =
    viewer === "debug" || revealed || viewer === state.battingTeam;

  return {
    sequence: duel.sequence,
    status: duel.status,
    pitcherLocked: true,
    pitcherChoice: canSeeChoice ? duel.pitcherChoice : null,
    hint: canSeeHint ? { ...duel.hint } : null,
    batterDecision: revealed ? duel.batterDecision : null,
    duelWinner: revealed ? (duel.duelWinner ?? null) : null,
    actualLocation:
      (revealed || viewer === "debug") && duel.actualLocation
        ? { ...duel.actualLocation }
        : null,
    result: revealed ? duel.result : null,
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
  state.activeStrategy = null;
  emit(state, events, { kind: "game_end", summary });
}

function occupiedBaseCount(bases: Bases) {
  return Number(bases.first) + Number(bases.second) + Number(bases.third);
}

function isInfieldFlySituation(state: GameState) {
  return state.outs < 2 && state.bases.first && state.bases.second;
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
