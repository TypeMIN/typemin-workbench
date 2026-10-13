import { CARD_DEFINITIONS } from "./cards";
import { getLegalCards, getPendingOwners } from "./engine";
import { getTeamTendencies, type RateSample } from "./scouting";
import type {
  CardId,
  GameAction,
  GameState,
  PitchTarget,
  TeamSide,
} from "./types";

/**
 * The AI reads only revealed pitches, so it plays the same information game
 * as a person. Each read is smoothed toward a prior so a few early choices do
 * not swing it, and the response is softened so the AI never becomes a fixed
 * pattern that can be exploited in turn.
 */
const READ_PRIOR_SAMPLES = 6;
const PRIOR_SWING_RATE = 0.55;
const PRIOR_STRIKE_RATE = 0.62;
const READ_RESPONSE = 1.1;
const PITCH_BALL_RANGE = { min: 0.12, max: 0.68 } as const;
const SWING_RANGE = { min: 0.22, max: 0.85 } as const;
const FULL_BALLS_BALL_FACTOR = 0.35;
const TWO_STRIKE_BALL_BONUS = 0.1;
const TWO_STRIKE_SWING_BONUS = 0.12;
const THREE_BALL_SWING_PENALTY = 0.12;

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
): GameAction | null {
  if (!getPendingOwners(state).includes(aiTeam) || state.phase === "finished") {
    return null;
  }

  if (state.phase === "awaiting_card") {
    const legalCards = getLegalCards(state).filter((item) => item.playable);
    const selected = legalCards.reduce<(typeof legalCards)[number] | null>(
      (best, candidate) => {
        if (!best) return candidate;
        return scoreCard(state, candidate.instance.cardId) >
          scoreCard(state, best.instance.cardId)
          ? candidate
          : best;
      },
      null,
    );
    return selected
      ? { type: "PLAY_CARD", cardInstanceId: selected.instance.instanceId }
      : { type: "PASS_CARD_WINDOW" };
  }

  // In a v4 duel the batting AI locks its decision while the pitch is open.
  if (state.phase === "awaiting_pitch" && aiTeam === state.battingTeam) {
    return {
      type: "SELECT_SWING",
      decision: random() < swingChance(state, aiTeam) ? "swing" : "take",
    };
  }
  if (state.phase === "awaiting_pitch") {
    return {
      type: "SELECT_PITCH",
      target: choosePitchTarget(state, aiTeam, random),
    };
  }
  if (state.phase === "awaiting_swing") {
    return {
      type: "SELECT_SWING",
      decision: random() < swingChance(state, aiTeam) ? "swing" : "take",
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
) {
  const sample =
    twoStrikes && samples.twoStrikes.count > 0
      ? samples.twoStrikes
      : samples.all;
  return (
    (sample.hits + prior * READ_PRIOR_SAMPLES) /
    (sample.count + READ_PRIOR_SAMPLES)
  );
}

function respond(rate: number, range: { min: number; max: number }) {
  const value = 0.5 + (rate - 0.5) * READ_RESPONSE;
  return Math.min(range.max, Math.max(range.min, value));
}

/** Throw balls to a batter who chases, strikes to one who waits. */
export function pitchBallChance(state: GameState, aiTeam: TeamSide) {
  const batter = getTeamTendencies(state.eventLog, opponentOf(aiTeam)).batting;
  const swingRate = smoothedRate(batter, state.strikes === 2, PRIOR_SWING_RATE);
  let chance = respond(swingRate, PITCH_BALL_RANGE);
  if (state.strikes === 2 && state.balls < 3) chance += TWO_STRIKE_BALL_BONUS;
  if (state.balls === 3) chance *= FULL_BALLS_BALL_FACTOR;
  return Math.min(PITCH_BALL_RANGE.max, chance);
}

/** Swing at a pitcher who lives in the zone, take against one who nibbles. */
export function swingChance(state: GameState, aiTeam: TeamSide) {
  const pitcher = getTeamTendencies(
    state.eventLog,
    opponentOf(aiTeam),
  ).pitching;
  const strikeRate = smoothedRate(
    pitcher,
    state.strikes === 2,
    PRIOR_STRIKE_RATE,
  );
  let chance = respond(strikeRate, SWING_RANGE);
  if (state.strikes === 2) chance += TWO_STRIKE_SWING_BONUS;
  if (state.balls === 3) chance -= THREE_BALL_SWING_PENALTY;
  return Math.min(SWING_RANGE.max, Math.max(SWING_RANGE.min, chance));
}

function choosePitchTarget(
  state: GameState,
  aiTeam: TeamSide,
  random: () => number,
): PitchTarget {
  return random() < pitchBallChance(state, aiTeam) ? "ball" : "strike";
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
