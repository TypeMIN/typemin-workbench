import { describe, expect, it } from "vitest";

import {
  getBasesAfterRevision,
  getEventsThrough,
  getHighlights,
} from "./highlights";
import { createGame } from "./engine";
import { buildRematchState } from "./multiplayer/series";
import type { GameEvent } from "./types";

function event(overrides: Partial<GameEvent>): GameEvent {
  return {
    sequence: overrides.revision ?? 1,
    revision: 1,
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

describe("highlights", () => {
  it("keeps scoring plays, home runs and the final out in order", () => {
    const log = [
      event({ revision: 1, summary: "볼 1" }),
      event({ revision: 2, runs: 1, summary: "주자 득점" }),
      event({ revision: 3, face: "HR", runs: 2, summary: "투런 홈런" }),
      event({ revision: 4, kind: "game_end", summary: "경기 종료" }),
    ];
    expect(
      getHighlights(log).map((item) => [item.revision, item.kind]),
    ).toEqual([
      [2, "score"],
      [3, "home_run"],
      [4, "final"],
    ]);
  });

  it("keeps the biggest plays when there are too many", () => {
    const log = [
      event({ revision: 1, runs: 1 }),
      event({ revision: 2, runs: 3 }),
      event({ revision: 3, runs: 2 }),
      event({ revision: 4, kind: "game_end" }),
    ];
    expect(getHighlights(log, 3).map((item) => item.revision)).toEqual([
      2, 3, 4,
    ]);
  });

  it("rebuilds the bases after a revision and clears them between halves", () => {
    const log = [
      event({
        revision: 1,
        moves: [{ runner: "batter", from: "batter", to: "first" }],
      }),
      event({
        revision: 2,
        moves: [
          { runner: "first", from: "first", to: "third" },
          { runner: "batter", from: "batter", to: "first" },
        ],
      }),
      event({ revision: 3, kind: "half_inning" }),
    ];
    expect(getBasesAfterRevision(log, 2)).toEqual({
      first: true,
      second: false,
      third: true,
    });
    expect(getBasesAfterRevision(log, 3)).toEqual({
      first: false,
      second: false,
      third: false,
    });
    expect(getEventsThrough(log, 2)).toHaveLength(2);
  });
});

describe("rematch state", () => {
  it("swaps the team names and keeps the revision counting up", () => {
    const previous = createGame({
      innings: 5,
      awayTeamName: "블루",
      homeTeamName: "레드",
    });
    previous.revision = 57;
    const next = buildRematchState(previous, 9);
    expect(next.revision).toBe(58);
    expect(next.config).toEqual({
      innings: 5,
      awayTeamName: "레드",
      homeTeamName: "블루",
    });
    expect(next.eventLog).toEqual([]);
  });
});
