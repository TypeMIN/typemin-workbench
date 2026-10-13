import { CARD_DEFINITIONS } from "./cards";
import { getLegalCards, getPendingOwners } from "./engine";
import { getTeamTendencies, type RateSample } from "./scouting";
import type { CardId, GameAction, GameState, TeamSide } from "./types";

/**
 * The AI reads only revealed pitches, so it plays the same information game
 * as a person. Each read is smoothed toward a prior so a few early choices do
 * not swing it, and the response is softened so the AI never becomes a fixed
 * pattern that can be exploited in turn.
 */
const PRIOR_SWING_RATE = 0.55;
const PRIOR_STRIKE_RATE = 0.62;
const FULL_BALLS_BALL_FACTOR = 0.35;
const TWO_STRIKE_BALL_BONUS = 0.1;
const TWO_STRIKE_SWING_BONUS = 0.12;
const THREE_BALL_SWING_PENALTY = 0.12;

export type AiDifficulty = "easy" | "normal" | "hard";

type AiProfile = {
  /** Fewer prior samples means the AI adapts to a habit sooner. */
  priorSamples: number;
  /** How far a read pushes the choice away from a coin flip. */
  readResponse: number;
  pitchBallRange: { min: number; max: number };
  swingRange: { min: number; max: number };
  /** Chance to use the best playable card instead of passing. */
  cardUseRate: number;
  /** Easy flips coins and grabs any card, so its play stays readable. */
  reads: boolean;
};

export const AI_PROFILES: Record<AiDifficulty, AiProfile> = {
  easy: {
    priorSamples: 6,
    readResponse: 0,
    pitchBallRange: { min: 0.5, max: 0.5 },
    swingRange: { min: 0.5, max: 0.5 },
    cardUseRate: 0.5,
    reads: false,
  },
  normal: {
    priorSamples: 6,
    readResponse: 1.1,
    pitchBallRange: { min: 0.12, max: 0.68 },
    swingRange: { min: 0.22, max: 0.85 },
    cardUseRate: 1,
    reads: true,
  },
  hard: {
    priorSamples: 3,
    readResponse: 1.6,
    pitchBallRange: { min: 0.08, max: 0.78 },
    swingRange: { min: 0.15, max: 0.9 },
    cardUseRate: 1,
    reads: true,
  },
};

const CARD_PRIORITY: Partial<Record<CardId, number>> = {
  GTP: 120,
  HRC: 116,
  SQ2: 112,
  SNO: 110,
  POE: 108,
  CIB: 106,
  GDP: 104,
  LDP: 102,
  CSH: 100,
  AHH: 98,
  A3H: 96,
  AHF: 94,
  A3F: 92,
  IOB: 90,
  RHB: 88,
  "1H1E": 86,
  SQ1: 84,
  CS3: 82,
  CS2: 80,
  CO3: 78,
  CO1: 76,
  HNR: 74,
  RNH: 72,
  E: 70,
  SBH: 68,
  FFO: 66,
  IFD: 64,
  BD: 62,
  GBH: 60,
  PO2: 58,
  PO1: 56,
  HBP: 54,
  WP: 52,
  SB3: 50,
  SB2: 48,
  SB: 46,
  BK: 44,
  A2: 42,
};

/**
 * Chooses exactly one legal action for the AI-controlled team.
 * The returned action still goes through transition(), so AI and human turns
 * share the same validation, event log, and replay format.
 */
export function chooseAiAction(
  state: GameState,
  aiTeam: TeamSide,
  random: () => number = Math.random,
  difficulty: AiDifficulty = "normal",
): GameAction | null {
  const profile = AI_PROFILES[difficulty];
  if (!getPendingOwners(state).includes(aiTeam) || state.phase === "finished") {
    return null;
  }

  if (state.phase === "awaiting_card") {
    const legalCards = getLegalCards(state).filter((item) => item.playable);
    const selected = profile.reads
      ? legalCards.reduce<(typeof legalCards)[number] | null>(
          (best, candidate) => {
            if (!best) return candidate;
            return scoreCard(state, candidate.instance.cardId) >
              scoreCard(state, best.instance.cardId)
              ? candidate
              : best;
          },
          null,
        )
      : (legalCards[Math.floor(random() * legalCards.length)] ?? null);
    return selected && random() < profile.cardUseRate
      ? { type: "PLAY_CARD", cardInstanceId: selected.instance.instanceId }
      : { type: "PASS_CARD_WINDOW" };
  }

  // In a v4 duel the batting AI locks its decision while the pitch is open.
  if (state.phase === "awaiting_pitch" && aiTeam === state.battingTeam) {
    return {
      type: "SELECT_SWING",
      decision:
        random() < swingChance(state, aiTeam, difficulty) ? "swing" : "take",
    };
  }
  if (state.phase === "awaiting_pitch") {
    return {
      type: "SELECT_PITCH",
      target:
        random() < pitchBallChance(state, aiTeam, difficulty)
          ? "ball"
          : "strike",
    };
  }
  if (state.phase === "awaiting_swing") {
    return {
      type: "SELECT_SWING",
      decision:
        random() < swingChance(state, aiTeam, difficulty) ? "swing" : "take",
    };
  }
  return null;
}

function opponentOf(team: TeamSide): TeamSide {
  return team === "away" ? "home" : "away";
}

function smoothedRate(
  samples: { all: RateSample; twoStrikes: RateSample },
  twoStrikes: boolean,
  prior: number,
  priorSamples: number,
) {
  const sample =
    twoStrikes && samples.twoStrikes.count > 0
      ? samples.twoStrikes
      : samples.all;
  return (sample.hits + prior * priorSamples) / (sample.count + priorSamples);
}

function respond(
  rate: number,
  profile: AiProfile,
  range: AiProfile["swingRange"],
) {
  const value = 0.5 + (rate - 0.5) * profile.readResponse;
  return Math.min(range.max, Math.max(range.min, value));
}

/** Throw balls to a batter who chases, strikes to one who waits. */
export function pitchBallChance(
  state: GameState,
  aiTeam: TeamSide,
  difficulty: AiDifficulty = "normal",
) {
  const profile = AI_PROFILES[difficulty];
  if (!profile.reads) return profile.pitchBallRange.max;
  const batter = getTeamTendencies(state.eventLog, opponentOf(aiTeam)).batting;
  const swingRate = smoothedRate(
    batter,
    state.strikes === 2,
    PRIOR_SWING_RATE,
    profile.priorSamples,
  );
  let chance = respond(swingRate, profile, profile.pitchBallRange);
  if (state.strikes === 2 && state.balls < 3) chance += TWO_STRIKE_BALL_BONUS;
  if (state.balls === 3) chance *= FULL_BALLS_BALL_FACTOR;
  return Math.min(profile.pitchBallRange.max, chance);
}

/** Swing at a pitcher who lives in the zone, take against one who nibbles. */
export function swingChance(
  state: GameState,
  aiTeam: TeamSide,
  difficulty: AiDifficulty = "normal",
) {
  const profile = AI_PROFILES[difficulty];
  if (!profile.reads) return profile.swingRange.max;
  const pitcher = getTeamTendencies(
    state.eventLog,
    opponentOf(aiTeam),
  ).pitching;
  const strikeRate = smoothedRate(
    pitcher,
    state.strikes === 2,
    PRIOR_STRIKE_RATE,
    profile.priorSamples,
  );
  let chance = respond(strikeRate, profile, profile.swingRange);
  if (state.strikes === 2) chance += TWO_STRIKE_SWING_BONUS;
  if (state.balls === 3) chance -= THREE_BALL_SWING_PENALTY;
  return Math.min(
    profile.swingRange.max,
    Math.max(profile.swingRange.min, chance),
  );
}

function scoreCard(state: GameState, cardId: CardId) {
  const definition = CARD_DEFINITIONS[cardId];
  let score = CARD_PRIORITY[cardId] ?? 40;

  if (definition.role === "offense" && state.bases.third) score += 18;
  if (definition.role === "defense" && state.outs === 2) score += 16;
  if (state.inning >= state.config.innings) score += 8;
  if (state.cardWindow?.respondingTo) score += 20;

  return score;
}
