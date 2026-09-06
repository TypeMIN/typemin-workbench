import { describe, expect, it } from "vitest";

import { chooseAiAction } from "./ai";
import { createGame } from "./engine";
import type { GameState } from "./types";

const CONFIG = {
  innings: 3 as const,
  awayTeamName: "원정",
  homeTeamName: "홈",
};

describe("baseball game AI", () => {
  it("acts only for the configured AI team", () => {
    const state = createGame(CONFIG);
    expect(chooseAiAction(state, "away", () => 0)).toBeNull();
    expect(chooseAiAction(state, "home", () => 0)).toEqual({
      type: "PITCH_RESULT",
      face: "S",
    });
  });

  it("uses the exact game dice and accepts an injected random source", () => {
    const pitch = createGame(CONFIG);
    expect(chooseAiAction(pitch, "home", () => 0.999_999)).toEqual({
      type: "PITCH_RESULT",
      face: "C",
    });

    const batting = {
      ...pitch,
      phase: "awaiting_batting",
    } as GameState;
    expect(chooseAiAction(batting, "away", () => 0.999_999)).toEqual({
      type: "BATTING_RESULT",
      face: "HR",
    });
  });

  it("selects a legal high-value strategy card without mutating state", () => {
    const initial = createGame(CONFIG);
    const state = {
      ...initial,
      phase: "awaiting_card",
      bases: { first: true, second: false, third: false },
      cardWindow: {
        timing: "before_pitch",
        priorityOrder: ["offense"],
        priorityIndex: 0,
        respondingTo: null,
      },
      cards: {
        ...initial.cards,
        offense: {
          drawPile: [],
          discardPile: [],
          hand: [
            { instanceId: "offense-BK-test", cardId: "BK" },
            { instanceId: "offense-HNR-test", cardId: "HNR" },
          ],
        },
      },
    } as GameState;
    const before = structuredClone(state);

    expect(chooseAiAction(state, "away")).toEqual({
      type: "PLAY_CARD",
      cardInstanceId: "offense-HNR-test",
    });
    expect(state).toEqual(before);
  });

  it("passes a card window when no card is playable", () => {
    const initial = createGame(CONFIG);
    const state = {
      ...initial,
      phase: "awaiting_card",
      cardWindow: {
        timing: "before_pitch",
        priorityOrder: ["defense"],
        priorityIndex: 0,
        respondingTo: null,
      },
      cards: {
        ...initial.cards,
        defense: { drawPile: [], discardPile: [], hand: [] },
      },
    } as GameState;

    expect(chooseAiAction(state, "home")).toEqual({
      type: "PASS_CARD_WINDOW",
    });
  });
});
