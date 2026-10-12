import { CARD_DEFINITIONS } from "./cards";
import type {
  CardId,
  CardRole,
  CardTiming,
  GameEvent,
  HalfInning,
  TeamSide,
} from "./types";

/** Everything here is derived from the shared event log, never from hands. */

export const RECENT_PITCH_WINDOW = 5;
export const CARD_NOTE_LIMIT = 6;

export type CardNote = {
  sequence: number;
  inning: number;
  half: HalfInning;
  role: CardRole;
  timing: CardTiming | null;
  kind: "played" | "passed";
  cardId: CardId | null;
};

export type DeckTrackerRow = {
  cardId: CardId;
  copies: number;
  played: number;
  maxRemaining: number;
};

export type RateSample = { count: number; hits: number };

export type TeamTendencies = {
  pitching: { all: RateSample; recent: RateSample; twoStrikes: RateSample };
  batting: { all: RateSample; recent: RateSample; twoStrikes: RateSample };
};

function battingTeamOf(half: HalfInning): TeamSide {
  return half === "top" ? "away" : "home";
}

export function cardActor(event: Pick<GameEvent, "half" | "cardRole">) {
  const batting = battingTeamOf(event.half);
  if (event.cardRole === "offense") return batting;
  return batting === "away" ? "home" : "away";
}

export function getCardNotes(
  eventLog: GameEvent[],
  team: TeamSide,
  limit = CARD_NOTE_LIMIT,
): CardNote[] {
  const notes: CardNote[] = [];
  for (const event of eventLog) {
    if (event.kind !== "card_play" && event.kind !== "card_pass") continue;
    if (!event.cardRole || cardActor(event) !== team) continue;
    notes.push({
      sequence: event.sequence,
      inning: event.inning,
      half: event.half,
      role: event.cardRole,
      timing: event.cardTiming ?? null,
      kind: event.kind === "card_play" ? "played" : "passed",
      cardId: event.kind === "card_play" ? (event.cardId ?? null) : null,
    });
  }
  return notes.slice(-limit).reverse();
}

/**
 * Upper bound of each card still available to a role since its last
 * reshuffle. Hands dumped at a half-inning change stay hidden, so the true
 * count can be lower but never higher.
 */
export function getDeckTracker(
  eventLog: GameEvent[],
  role: CardRole,
  reshuffleCount: number,
): DeckTrackerRow[] {
  const played = new Map<CardId, number>();
  const order: CardId[] = [];
  for (const event of eventLog) {
    if (
      event.kind !== "card_play" ||
      event.cardRole !== role ||
      !event.cardId ||
      (event.deckCycle ?? 0) !== reshuffleCount
    ) {
      continue;
    }
    played.set(event.cardId, (played.get(event.cardId) ?? 0) + 1);
    if (!order.includes(event.cardId)) order.push(event.cardId);
  }
  return order.reverse().map((cardId) => {
    const copies = CARD_DEFINITIONS[cardId].copies;
    const count = played.get(cardId) ?? 0;
    return {
      cardId,
      copies,
      played: count,
      maxRemaining: Math.max(0, copies - count),
    };
  });
}

function rate(samples: boolean[]): RateSample {
  return { count: samples.length, hits: samples.filter(Boolean).length };
}

export function ratePercent(sample: RateSample) {
  return sample.count === 0
    ? null
    : Math.round((sample.hits / sample.count) * 100);
}

/** Replays revealed pitches to recover the count each choice was made in. */
export function getTeamTendencies(
  eventLog: GameEvent[],
  team: TeamSide,
): TeamTendencies {
  const pitched: Array<{ strike: boolean; twoStrikes: boolean }> = [];
  const swung: Array<{ swing: boolean; twoStrikes: boolean }> = [];
  let strikes = 0;
  for (const event of eventLog) {
    if (
      event.kind === "plate_appearance" ||
      event.kind === "half_inning" ||
      event.kind === "game_end"
    ) {
      strikes = 0;
      continue;
    }
    if (event.kind !== "pitch_result" || !event.face) continue;
    const batting = battingTeamOf(event.half);
    const twoStrikes = strikes >= 2;
    if (event.pitchTarget && batting !== team) {
      pitched.push({ strike: event.pitchTarget === "strike", twoStrikes });
    }
    if (event.swingDecision && batting === team) {
      swung.push({ swing: event.swingDecision === "swing", twoStrikes });
    }
    if (event.face === "S" || event.face === "SM") {
      strikes = Math.min(2, strikes + 1);
    } else if (event.face === "F" && strikes < 2) {
      strikes += 1;
    }
  }
  return {
    pitching: {
      all: rate(pitched.map((item) => item.strike)),
      recent: rate(
        pitched.slice(-RECENT_PITCH_WINDOW).map((item) => item.strike),
      ),
      twoStrikes: rate(
        pitched.filter((item) => item.twoStrikes).map((item) => item.strike),
      ),
    },
    batting: {
      all: rate(swung.map((item) => item.swing)),
      recent: rate(swung.slice(-RECENT_PITCH_WINDOW).map((item) => item.swing)),
      twoStrikes: rate(
        swung.filter((item) => item.twoStrikes).map((item) => item.swing),
      ),
    },
  };
}
