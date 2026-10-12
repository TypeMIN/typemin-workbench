import { describe, expect, it } from "vitest";

import { createGame, transition } from "../engine";
import { getPresentationDuration } from "../presentation";
import type { GameState } from "../types";
import {
  DECISION_LIMIT_MS,
  FORFEIT_AFTER_CONSECUTIVE_TIMEOUTS,
  PRESENTATION_SYNC_BUFFER_MS,
  TEAM_TIMEOUTS_PER_GAME,
  buildShotClockView,
  canClaimForfeit,
  chooseTimeoutAction,
  createClockState,
  getClockWindow,
  nextClockAfterCommit,
  resolveClockState,
} from "./shot-clock";

const STARTED_AT = "2026-10-13T00:00:00.000Z";
const STARTED_MS = Date.parse(STARTED_AT);

function newGame() {
  return createGame(
    { innings: 3, awayTeamName: "원정", homeTeamName: "홈" },
    { seed: 7 },
  );
}

function apply(state: GameState, action: Parameters<typeof transition>[1]) {
  const result = transition(state, action);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

describe("shot clock window", () => {
  it("starts the first pitch clock after the sync buffer", () => {
    const state = newGame();
    const window = getClockWindow(state, STARTED_AT, createClockState(0));
    expect(window).toEqual({
      owner: "home",
      startsAt: STARTED_MS + PRESENTATION_SYNC_BUFFER_MS,
      deadlineAt:
        STARTED_MS +
        PRESENTATION_SYNC_BUFFER_MS +
        DECISION_LIMIT_MS.awaiting_pitch,
    });
  });

  it("does not run the clock while the revision's scene replays", () => {
    const pitched = apply(newGame(), {
      type: "SELECT_PITCH",
      target: "strike",
    });
    const swung = apply(pitched, { type: "SELECT_SWING", decision: "take" });
    const revisionEvents = swung.eventLog.filter(
      (event) => event.revision === swung.revision,
    );
    const replayMs = getPresentationDuration(revisionEvents);
    expect(replayMs).toBeGreaterThan(0);

    const window = getClockWindow(
      swung,
      STARTED_AT,
      createClockState(swung.revision),
    );
    expect(window?.startsAt).toBe(
      STARTED_MS + replayMs + PRESENTATION_SYNC_BUFFER_MS,
    );
  });

  it("adds called timeouts and grace to the deadline", () => {
    const state = newGame();
    const clock = { ...createClockState(0), extensionMs: 45_000 };
    const plain = getClockWindow(state, STARTED_AT, createClockState(0));
    const extended = getClockWindow(state, STARTED_AT, clock);
    expect(extended!.deadlineAt - plain!.deadlineAt).toBe(45_000);
  });

  it("has no deadline once the game is finished", () => {
    const finished = { ...newGame(), phase: "finished" as const };
    expect(
      getClockWindow(finished, STARTED_AT, createClockState(0)),
    ).toBeNull();
  });
});

describe("shot clock bookkeeping", () => {
  it("drops per-decision extensions when the revision moves on", () => {
    const clock = {
      ...createClockState(3),
      extensionMs: 30_000,
      graceUsed: true,
    };
    expect(resolveClockState(clock, 4)).toMatchObject({
      revision: 4,
      extensionMs: 0,
      graceUsed: false,
    });
    expect(resolveClockState(null, 2)).toEqual(createClockState(2));
  });

  it("counts consecutive timeouts per team and resets on a real decision", () => {
    let clock = createClockState(0);
    clock = nextClockAfterCommit(clock, {
      actor: "home",
      newRevision: 1,
      timedOut: true,
    });
    clock = nextClockAfterCommit(clock, {
      actor: "home",
      newRevision: 2,
      timedOut: true,
    });
    expect(clock.consecutiveTimeouts.home).toBe(2);
    expect(clock.lastTimeout).toEqual({ revision: 2, team: "home" });
    clock = nextClockAfterCommit(clock, {
      actor: "home",
      newRevision: 3,
      timedOut: false,
    });
    expect(clock.consecutiveTimeouts.home).toBe(0);
  });

  it("lets only the opponent of a repeatedly absent team claim a forfeit", () => {
    const clock = {
      ...createClockState(0),
      consecutiveTimeouts: {
        away: 0,
        home: FORFEIT_AFTER_CONSECUTIVE_TIMEOUTS,
      },
    };
    expect(canClaimForfeit(clock, "away")).toBe(true);
    expect(canClaimForfeit(clock, "home")).toBe(false);
    expect(canClaimForfeit({ ...clock, forfeitedBy: "home" }, "away")).toBe(
      false,
    );
  });

  it("picks safe automatic decisions for each timed phase", () => {
    const state = newGame();
    expect(chooseTimeoutAction(state, () => 1)).toEqual({
      type: "SELECT_PITCH",
      target: "ball",
    });
    expect(
      chooseTimeoutAction({ ...state, phase: "awaiting_swing" }, () => 0),
    ).toEqual({ type: "SELECT_SWING", decision: "take" });
    expect(
      chooseTimeoutAction({ ...state, phase: "awaiting_card" }, () => 0),
    ).toEqual({ type: "PASS_CARD_WINDOW" });
  });

  it("exposes the clock only while the room is playing", () => {
    const view = buildShotClockView({
      state: newGame(),
      revisionStartedAt: STARTED_AT,
      clock: createClockState(0),
      playing: false,
      now: STARTED_MS,
    });
    expect(view.deadlineAt).toBeNull();
    expect(view.timeoutsRemaining.home).toBe(TEAM_TIMEOUTS_PER_GAME);
  });
});
