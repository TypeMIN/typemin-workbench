import { describe, expect, it } from "vitest";

import { chooseAiAction, pitchBallChance, swingChance } from "./ai";
import { createGame, transition } from "./engine";
import type { GameEvent, GameState } from "./types";

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
      type: "SELECT_PITCH",
      target: "ball",
    });
  });

  it("chooses a pitch and swing through the same one-step actions as a player", () => {
    const pitch = createGame(CONFIG);
    expect(chooseAiAction(pitch, "home", () => 0.999_999)).toEqual({
      type: "SELECT_PITCH",
      target: "strike",
    });

    const locked = transition(pitch, {
      type: "SELECT_PITCH",
      target: "strike",
    });
    if (!locked.ok) throw new Error("투구 선택 실패");
    expect(chooseAiAction(locked.state, "away", () => 0)).toEqual({
      type: "SELECT_SWING",
      decision: "swing",
    });
  });

  it("bases the batter decision on the count, not the hidden pitch choice", () => {
    const initial = createGame(CONFIG);
    const locked = transition(initial, {
      type: "SELECT_PITCH",
      target: "strike",
    });
    if (!locked.ok || !locked.state.pitchDuel)
      throw new Error("투구 선택 실패");
    const alteredSecret = {
      ...locked.state,
      pitchDuel: { ...locked.state.pitchDuel, pitcherChoice: "ball" },
    } as GameState;
    expect(chooseAiAction(locked.state, "away", () => 0.4)).toEqual(
      chooseAiAction(alteredSecret, "away", () => 0.4),
    );
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

  it("throws more balls to a batter who keeps chasing", () => {
    const state = createGame(CONFIG);
    const chaser = withPitches(state, 12, { swing: true });
    const waiter = withPitches(state, 12, { swing: false });
    expect(pitchBallChance(chaser, "home")).toBeGreaterThan(
      pitchBallChance(state, "home"),
    );
    expect(pitchBallChance(waiter, "home")).toBeLessThan(
      pitchBallChance(state, "home"),
    );
  });

  it("avoids walks with three balls even against a chaser", () => {
    const chaser = withPitches(createGame(CONFIG), 12, { swing: true });
    expect(pitchBallChance({ ...chaser, balls: 3 }, "home")).toBeLessThan(
      pitchBallChance(chaser, "home") / 2,
    );
  });

  it("swings more against a pitcher who lives in the zone", () => {
    const state = createGame(CONFIG);
    const strikeThrower = withPitches(state, 12, { strike: true }, "bottom");
    const nibbler = withPitches(state, 12, { strike: false }, "bottom");
    expect(swingChance(strikeThrower, "home")).toBeGreaterThan(
      swingChance(nibbler, "home"),
    );
  });
});

function withPitches(
  state: GameState,
  count: number,
  pattern: { swing?: boolean; strike?: boolean },
  half: "top" | "bottom" = "top",
): GameState {
  const events: GameEvent[] = Array.from({ length: count }, (_, index) => ({
    sequence: index + 1,
    revision: index + 1,
    inning: 1,
    half,
    kind: "pitch_result",
    summary: "",
    face: "B",
    pitchTarget: (pattern.strike ?? true) ? "strike" : "ball",
    swingDecision: (pattern.swing ?? false) ? "swing" : "take",
    runs: 0,
    outsRecorded: 0,
    moves: [],
  }));
  return { ...state, eventLog: events };
}
