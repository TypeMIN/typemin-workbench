import { describe, expect, it } from "vitest";

import { createGame, getLegalActions, transition } from "./engine";
import {
  BATTING_DIE_FACES,
  HIT_DIE_FACES,
  PITCH_DIE_FACES,
  rollDie,
} from "./rules";
import type {
  Bases,
  BattingFace,
  GameAction,
  GameState,
  HitFace,
  PitchFace,
} from "./types";

const CONFIG = {
  innings: 3 as const,
  awayTeamName: "원정",
  homeTeamName: "홈",
};

function game(overrides: Partial<GameState> = {}) {
  const initial = createGame(CONFIG);
  return {
    ...initial,
    ...overrides,
    config: { ...initial.config, ...overrides.config },
    bases: { ...initial.bases, ...overrides.bases },
    score: { ...initial.score, ...overrides.score },
    eventLog: [...(overrides.eventLog ?? initial.eventLog)],
  } as GameState;
}

function apply(state: GameState, action: GameAction) {
  const result = transition(state, action);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

function pitch(state: GameState, face: PitchFace) {
  return apply(state, { type: "PITCH_RESULT", face });
}

function batting(state: GameState, face: BattingFace) {
  return apply(
    { ...state, phase: "awaiting_batting" },
    { type: "BATTING_RESULT", face },
  );
}

function hit(state: GameState, face: HitFace) {
  return apply(
    { ...state, phase: "awaiting_hit" },
    { type: "HIT_RESULT", face },
  );
}

const BASE_COMBINATIONS: Bases[] = Array.from({ length: 8 }, (_, mask) => ({
  first: Boolean(mask & 1),
  second: Boolean(mask & 2),
  third: Boolean(mask & 4),
}));

describe("core-v1 dice", () => {
  it("uses the exact three D12 face distributions", () => {
    expect(PITCH_DIE_FACES).toEqual([
      "S",
      "S",
      "SM",
      "F",
      "B",
      "B",
      "B",
      "B",
      "C",
      "C",
      "C",
      "C",
    ]);
    expect(BATTING_DIE_FACES).toHaveLength(12);
    expect(BATTING_DIE_FACES.filter((face) => face === "HIT")).toHaveLength(3);
    expect(HIT_DIE_FACES).toHaveLength(12);
    expect(HIT_DIE_FACES.filter((face) => face === "L2")).toHaveLength(2);
    expect(HIT_DIE_FACES.filter((face) => face === "R2")).toHaveLength(2);
  });

  it("maps random values to faces and rejects invalid random sources", () => {
    expect(rollDie("pitch", () => 0)).toBe("S");
    expect(rollDie("pitch", () => 0.999_999)).toBe("C");
    expect(() => rollDie("hit", () => 1)).toThrow(RangeError);
    expect(() => rollDie("hit", () => -0.1)).toThrow(RangeError);
  });
});

describe("pitch and phase flow", () => {
  it("creates a serializable game with only pitch actions available", () => {
    const state = createGame({
      innings: 5,
      awayTeamName: "  ",
      homeTeamName: " 홈 ",
    });
    expect(state.config).toEqual({
      innings: 5,
      awayTeamName: "원정팀",
      homeTeamName: "홈",
    });
    expect(getLegalActions(state)).toEqual(["PITCH_RESULT"]);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("rejects out-of-phase actions without changing state or revision", () => {
    const state = createGame(CONFIG);
    const result = transition(state, { type: "BATTING_RESULT", face: "HR" });
    expect(result).toEqual({
      ok: false,
      state,
      error: {
        code: "WRONG_PHASE",
        message: "현재 단계에서는 PITCH_RESULT 행동이 필요합니다.",
        expectedAction: "PITCH_RESULT",
      },
    });
    expect(state.revision).toBe(0);
  });

  it("handles four balls, forced advancement, and a bases-loaded run", () => {
    let state = game({
      balls: 3,
      bases: { first: true, second: true, third: true },
    });
    state = pitch(state, "B");
    expect(state.balls).toBe(0);
    expect(state.strikes).toBe(0);
    expect(state.bases).toEqual({ first: true, second: true, third: true });
    expect(state.score.away).toBe(1);
    expect(state.eventLog.at(-1)?.summary).toBe("볼넷");
  });

  it("handles strikeouts and keeps a two-strike foul alive", () => {
    const foul = pitch(game({ strikes: 2 }), "F");
    expect(foul.strikes).toBe(2);
    expect(foul.outs).toBe(0);
    expect(foul.eventLog.at(-1)?.summary).toContain("유지");

    const strikeout = pitch(game({ strikes: 2 }), "SM");
    expect(strikeout.outs).toBe(1);
    expect(strikeout.strikes).toBe(0);
    expect(strikeout.phase).toBe("awaiting_pitch");
  });

  it("moves from contact to batting and from HIT to hit resolution", () => {
    let state = pitch(createGame(CONFIG), "C");
    expect(state.phase).toBe("awaiting_batting");
    expect(getLegalActions(state)).toEqual(["BATTING_RESULT"]);
    state = apply(state, { type: "BATTING_RESULT", face: "HIT" });
    expect(state.phase).toBe("awaiting_hit");
    expect(getLegalActions(state)).toEqual(["HIT_RESULT"]);
    state = apply(state, { type: "HIT_RESULT", face: "IH" });
    expect(state.phase).toBe("awaiting_pitch");
    expect(state.bases.first).toBe(true);
  });
});

describe("batted-ball and hit tables", () => {
  it.each(
    BASE_COMBINATIONS.flatMap((bases) =>
      ([0, 1, 2] as const).flatMap((outs) =>
        BATTING_DIE_FACES.filter((face) => face !== "HIT").map(
          (face) => [bases, outs, face] as const,
        ),
      ),
    ),
  )("keeps valid invariants for bases %o, %i outs, %s", (bases, outs, face) => {
    const next = batting(game({ bases, outs }), face);
    expect([true, false]).toContain(next.bases.first);
    expect([true, false]).toContain(next.bases.second);
    expect([true, false]).toContain(next.bases.third);
    expect([0, 1, 2]).toContain(next.outs);
    expect(next.score.away).toBeGreaterThanOrEqual(0);
    expect(next.revision).toBe(1);
  });

  it.each(
    BASE_COMBINATIONS.flatMap((bases) =>
      HIT_DIE_FACES.map((face) => [bases, face] as const),
    ),
  )("resolves every hit for bases %o and %s", (bases, face) => {
    const next = hit(game({ bases }), face);
    expect([true, false]).toContain(next.bases.first);
    expect([true, false]).toContain(next.bases.second);
    expect([true, false]).toContain(next.bases.third);
    expect(next.score.away).toBeGreaterThanOrEqual(0);
    expect(next.phase).toBe("awaiting_pitch");
  });

  it("resolves loaded GF, G3, and GA according to the documented rules", () => {
    const loaded = { first: true, second: true, third: true };
    const gf = batting(game({ bases: loaded }), "GF");
    expect(gf.bases).toEqual(loaded);
    expect(gf.outs).toBe(1);
    expect(gf.score.away).toBe(0);

    const g3 = batting(game({ bases: loaded }), "G3");
    expect(g3.bases).toEqual({ first: true, second: true, third: false });
    expect(g3.outs).toBe(1);
    expect(g3.score.away).toBe(1);

    const ga = batting(game({ bases: loaded }), "GA");
    expect(ga.bases).toEqual({ first: false, second: true, third: true });
    expect(ga.outs).toBe(1);
    expect(ga.score.away).toBe(1);
  });

  it("cancels tag-up and groundout runs when the batter makes the third out", () => {
    for (const face of ["GA", "F2", "F3", "FA"] as const) {
      const next = batting(
        game({ outs: 2, bases: { first: true, second: true, third: true } }),
        face,
      );
      expect(next.score.away).toBe(0);
      expect(next.half).toBe("bottom");
      expect(next.bases).toEqual({ first: false, second: false, third: false });
      expect(
        next.eventLog.findLast((event) => event.kind === "plate_appearance")
          ?.summary,
      ).toContain("진루와 득점 취소");
    }
  });

  it("treats D3 as a bases-clearing double and HR as all runners plus batter", () => {
    const loaded = game({
      bases: { first: true, second: true, third: true },
    });
    const double = hit(loaded, "D3");
    expect(double.score.away).toBe(3);
    expect(double.bases).toEqual({ first: false, second: true, third: false });

    const homer = batting(loaded, "HR");
    expect(homer.score.away).toBe(4);
    expect(homer.bases).toEqual({ first: false, second: false, third: false });
  });
});

describe("innings and game completion", () => {
  it("changes sides after the third out and clears count and bases", () => {
    const next = pitch(
      game({
        outs: 2,
        strikes: 2,
        balls: 2,
        bases: { first: true, second: false, third: true },
      }),
      "S",
    );
    expect(next).toMatchObject({
      inning: 1,
      half: "bottom",
      battingTeam: "home",
      outs: 0,
      balls: 0,
      strikes: 0,
      bases: { first: false, second: false, third: false },
    });
    expect(
      next.eventLog.findLast((event) => event.kind === "plate_appearance")
        ?.summary,
    ).toBe("삼진 · 3아웃");
  });

  it("skips the final bottom half when the home team leads", () => {
    const next = pitch(
      game({
        inning: 3,
        half: "top",
        battingTeam: "away",
        outs: 2,
        strikes: 2,
        score: { away: 0, home: 1 },
      }),
      "S",
    );
    expect(next.phase).toBe("finished");
    expect(next.winner).toBe("home");
    expect(getLegalActions(next)).toEqual([]);
  });

  it("finishes immediately on a walk-off home run", () => {
    const next = batting(
      game({
        inning: 3,
        half: "bottom",
        battingTeam: "home",
        score: { away: 0, home: 0 },
      }),
      "HR",
    );
    expect(next.phase).toBe("finished");
    expect(next.winner).toBe("home");
    expect(next.score.home).toBe(1);
    expect(next.eventLog.at(-1)?.kind).toBe("game_end");
  });

  it("ends with an away win or starts extras after the final bottom half", () => {
    const awayWin = pitch(
      game({
        inning: 3,
        half: "bottom",
        battingTeam: "home",
        outs: 2,
        strikes: 2,
        score: { away: 1, home: 0 },
      }),
      "S",
    );
    expect(awayWin.phase).toBe("finished");
    expect(awayWin.winner).toBe("away");

    const extra = pitch(
      game({
        inning: 3,
        half: "bottom",
        battingTeam: "home",
        outs: 2,
        strikes: 2,
        score: { away: 1, home: 1 },
      }),
      "S",
    );
    expect(extra.phase).toBe("awaiting_pitch");
    expect(extra.inning).toBe(4);
    expect(extra.half).toBe("top");
  });

  it("replays the same action sequence deterministically", () => {
    const actions: GameAction[] = [
      { type: "PITCH_RESULT", face: "B" },
      { type: "PITCH_RESULT", face: "C" },
      { type: "BATTING_RESULT", face: "HIT" },
      { type: "HIT_RESULT", face: "R2" },
      { type: "PITCH_RESULT", face: "S" },
      { type: "PITCH_RESULT", face: "SM" },
      { type: "PITCH_RESULT", face: "S" },
    ];
    const replay = () => actions.reduce(apply, createGame(CONFIG));
    expect(replay()).toEqual(replay());
  });
});
