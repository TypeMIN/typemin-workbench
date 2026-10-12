import { describe, expect, it } from "vitest";

import { CARD_DEFINITIONS } from "./cards";
import { createGame, getGameView, getLegalCards, transition } from "./engine";
import {
  cardActor,
  getCardNotes,
  getDeckTracker,
  getTeamTendencies,
  ratePercent,
} from "./scouting";
import type { GameAction, GameEvent, GameState } from "./types";

let sequence = 0;
function event(overrides: Partial<GameEvent>): GameEvent {
  sequence += 1;
  return {
    sequence,
    revision: sequence,
    inning: 1,
    half: "top",
    kind: "rule",
    summary: "",
    runs: 0,
    outsRecorded: 0,
    moves: [],
    ...overrides,
  };
}

describe("card notes", () => {
  it("attributes offense cards to the batting team and defense to the fielders", () => {
    expect(cardActor({ half: "top", cardRole: "offense" })).toBe("away");
    expect(cardActor({ half: "top", cardRole: "defense" })).toBe("home");
    expect(cardActor({ half: "bottom", cardRole: "offense" })).toBe("home");
  });

  it("lists an opponent's passes and plays newest first", () => {
    const log = [
      event({
        kind: "card_pass",
        cardRole: "defense",
        cardTiming: "after_batting",
      }),
      event({ kind: "card_play", cardRole: "offense", cardId: "SB2" }),
      event({
        kind: "card_play",
        cardRole: "defense",
        cardId: "GDP",
        cardTiming: "after_batting",
      }),
    ];
    const notes = getCardNotes(log, "home");
    expect(notes.map((note) => note.kind)).toEqual(["played", "passed"]);
    expect(notes[0]).toMatchObject({ cardId: "GDP", timing: "after_batting" });
    expect(getCardNotes(log, "away")).toHaveLength(1);
  });
});

describe("deck tracker", () => {
  it("counts only the current deck cycle and never goes negative", () => {
    const copies = CARD_DEFINITIONS.GDP.copies;
    const log = [
      event({
        kind: "card_play",
        cardRole: "defense",
        cardId: "GDP",
        deckCycle: 0,
      }),
      ...Array.from({ length: copies + 1 }, () =>
        event({
          kind: "card_play",
          cardRole: "defense",
          cardId: "GDP",
          deckCycle: 1,
        }),
      ),
    ];
    expect(getDeckTracker(log, "defense", 1)).toEqual([
      { cardId: "GDP", copies, played: copies + 1, maxRemaining: 0 },
    ]);
    expect(getDeckTracker(log, "defense", 0)[0].played).toBe(1);
    expect(getDeckTracker(log, "offense", 1)).toEqual([]);
  });
});

describe("tendencies", () => {
  it("splits the opponent pitcher's choices by two-strike counts", () => {
    const log = [
      event({
        kind: "pitch_result",
        face: "S",
        pitchTarget: "strike",
        swingDecision: "take",
      }),
      event({
        kind: "pitch_result",
        face: "F",
        pitchTarget: "strike",
        swingDecision: "swing",
      }),
      event({
        kind: "pitch_result",
        face: "B",
        pitchTarget: "ball",
        swingDecision: "take",
      }),
      event({
        kind: "pitch_result",
        face: "SM",
        pitchTarget: "ball",
        swingDecision: "swing",
      }),
      event({ kind: "plate_appearance" }),
      event({
        kind: "pitch_result",
        face: "B",
        pitchTarget: "ball",
        swingDecision: "take",
      }),
    ];
    const home = getTeamTendencies(log, "home");
    expect(home.pitching.all).toEqual({ count: 5, hits: 2 });
    expect(home.pitching.twoStrikes).toEqual({ count: 2, hits: 0 });
    expect(home.batting.all.count).toBe(0);

    const away = getTeamTendencies(log, "away");
    expect(away.batting.all).toEqual({ count: 5, hits: 2 });
    expect(away.batting.twoStrikes).toEqual({ count: 2, hits: 1 });
    expect(ratePercent(away.batting.twoStrikes)).toBe(50);
    expect(ratePercent({ count: 0, hits: 0 })).toBeNull();
  });
});

describe("engine card counting data", () => {
  it("stamps every played card with its timing and a cycle no later than the deck", () => {
    let state: GameState = createGame(
      { innings: 9, awayTeamName: "원정", homeTeamName: "홈" },
      { seed: 3 },
    );
    let guard = 0;
    while (state.phase !== "finished" && guard < 4_000) {
      guard += 1;
      let action: GameAction;
      if (state.phase === "awaiting_card") {
        const playable = getLegalCards(state).find((item) => item.playable);
        action = playable
          ? { type: "PLAY_CARD", cardInstanceId: playable.instance.instanceId }
          : { type: "PASS_CARD_WINDOW" };
      } else if (state.phase === "awaiting_pitch") {
        action = {
          type: "SELECT_PITCH",
          target: guard % 3 ? "strike" : "ball",
        };
      } else if (state.phase === "awaiting_swing") {
        action = {
          type: "SELECT_SWING",
          decision: guard % 2 ? "swing" : "take",
        };
      } else {
        break;
      }
      const result = transition(state, action);
      if (!result.ok) throw new Error(result.error.message);
      state = result.state;
    }

    const plays = state.eventLog.filter((item) => item.kind === "card_play");
    expect(plays.length).toBeGreaterThan(0);
    for (const play of plays) {
      expect(play.cardTiming).toBeDefined();
      expect(play.deckCycle).toBeLessThanOrEqual(
        state.cards[play.cardRole!].reshuffleCount ?? 0,
      );
    }
    const view = getGameView(state, "public");
    for (const role of ["offense", "defense"] as const) {
      expect(view.cards[role].reshuffleCount).toBe(
        state.cards[role].reshuffleCount,
      );
      for (const row of getDeckTracker(
        state.eventLog,
        role,
        view.cards[role].reshuffleCount,
      )) {
        expect(row.maxRemaining).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
