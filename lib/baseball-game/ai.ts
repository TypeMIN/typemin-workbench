import { CARD_DEFINITIONS } from "./cards";
import { getActionOwner, getLegalCards } from "./engine";
import type {
  CardId,
  GameAction,
  GameState,
  PitchTarget,
  TeamSide,
} from "./types";

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
  if (getActionOwner(state) !== aiTeam || state.phase === "finished") {
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

  if (state.phase === "awaiting_pitch") {
    return { type: "SELECT_PITCH", target: choosePitchTarget(state, random) };
  }
  if (state.phase === "awaiting_swing") {
    let swingChance = 0.5;
    if (state.strikes === 2) swingChance = 0.68;
    if (state.balls === 3) swingChance = 0.34;
    return {
      type: "SELECT_SWING",
      decision: random() < swingChance ? "swing" : "take",
    };
  }
  return null;
}

function choosePitchTarget(
  state: GameState,
  random: () => number,
): PitchTarget {
  const ballChance = state.balls === 3 ? 0.08 : state.strikes === 2 ? 0.3 : 0.2;
  return random() < ballChance ? "ball" : "strike";
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
