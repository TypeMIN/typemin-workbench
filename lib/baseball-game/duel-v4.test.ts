import { describe, expect, it } from "vitest";

import {
  createGame,
  getActionActor,
  getGameView,
  getLegalActions,
  getPendingOwners,
  transition,
} from "./engine";
import type { GameAction, GameState } from "./types";

const CONFIG = {
  innings: 3 as const,
  awayTeamName: "원정",
  homeTeamName: "홈",
};

function apply(state: GameState, action: GameAction) {
  const result = transition(state, action);
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

describe("pitch-duel-v4 simultaneous duel", () => {
  it("waits for both the pitcher and the batter at the start of a pitch", () => {
    const state = createGame(CONFIG, { seed: 21 });
    expect(getPendingOwners(state)).toEqual(["home", "away"]);
    expect(
      getActionActor(state, { type: "SELECT_SWING", decision: "swing" }),
    ).toBe("away");
    expect(
      getActionActor(state, { type: "SELECT_PITCH", target: "ball" }),
    ).toBe("home");
  });

  it("keeps an early swing secret and emits no lock scene", () => {
    const locked = apply(createGame(CONFIG, { seed: 21 }), {
      type: "SELECT_SWING",
      decision: "swing",
    });
    expect(locked.events).toEqual([]);
    expect(locked.state.phase).toBe("awaiting_pitch");
    expect(getPendingOwners(locked.state)).toEqual(["home"]);
    for (const viewer of ["home", "away", "public"] as const) {
      const view = getGameView(locked.state, viewer);
      expect(view.batterLocked).toBe(true);
      expect(view).not.toHaveProperty("earlySwing");
      expect(JSON.stringify(view)).not.toContain('"swing"');
    }
  });

  it("produces the same play whichever side submits first", () => {
    const seed = 77;
    const batterFirst = apply(
      apply(createGame(CONFIG, { seed }), {
        type: "SELECT_SWING",
        decision: "swing",
      }).state,
      { type: "SELECT_PITCH", target: "strike" },
    ).state;
    const pitcherFirst = apply(
      apply(createGame(CONFIG, { seed }), {
        type: "SELECT_PITCH",
        target: "strike",
      }).state,
      { type: "SELECT_SWING", decision: "swing" },
    ).state;
    const strip = (state: GameState) =>
      state.eventLog.map(({ kind, face, pitchLocation, moves, runs }) => ({
        kind,
        face,
        pitchLocation,
        moves,
        runs,
      }));
    expect(strip(batterFirst)).toEqual(strip(pitcherFirst));
    expect(batterFirst.rng).toEqual(pitcherFirst.rng);
    expect(
      batterFirst.eventLog.some((event) => event.kind === "pitch_commit"),
    ).toBe(false);
  });

  it("rejects a second batter decision for the same pitch", () => {
    const locked = apply(createGame(CONFIG, { seed: 3 }), {
      type: "SELECT_SWING",
      decision: "take",
    }).state;
    const again = transition(locked, {
      type: "SELECT_SWING",
      decision: "swing",
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("ALREADY_LOCKED");
  });

  it("clears the early decision once the pitch resolves", () => {
    const resolved = apply(
      apply(createGame(CONFIG, { seed: 9 }), {
        type: "SELECT_SWING",
        decision: "take",
      }).state,
      { type: "SELECT_PITCH", target: "ball" },
    ).state;
    expect(resolved.earlySwing ?? null).toBeNull();
  });

  it("keeps v3 saves sequential", () => {
    const v3 = {
      ...createGame(CONFIG, { seed: 5 }),
      rulesetVersion: "pitch-duel-v3" as const,
    };
    expect(getLegalActions(v3)).toEqual(["SELECT_PITCH"]);
    expect(getPendingOwners(v3)).toEqual(["home"]);
    expect(transition(v3, { type: "SELECT_SWING", decision: "swing" }).ok).toBe(
      false,
    );
    const pitched = apply(v3, { type: "SELECT_PITCH", target: "strike" });
    expect(pitched.events.map((event) => event.kind)).toEqual(["pitch_commit"]);
    expect(pitched.state.rulesetVersion).toBe("pitch-duel-v3");
  });
});
