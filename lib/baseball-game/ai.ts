import { CARD_DEFINITIONS } from "./cards";
import { getActionOwner, getLegalCards } from "./engine";
import { rollDie } from "./rules";
import type { CardId, GameAction, GameState, TeamSide } from "./types";

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
    return { type: "PITCH_RESULT", face: rollDie("pitch", random) };
  }
  if (state.phase === "awaiting_batting") {
    return { type: "BATTING_RESULT", face: rollDie("batting", random) };
  }
  return { type: "HIT_RESULT", face: rollDie("hit", random) };
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
