import { describe, expect, it } from "vitest";

import {
  BATTER_DUEL_HIT_BONUS,
  createActualPitchLocation,
  getBattedBallTendency,
  PITCHER_DUEL_HIT_PENALTY,
  PITCH_TARGETS,
  PITCH_TENDENCIES,
  resolveBattedBall,
  resolveDuelWinner,
  resolvePitchFace,
} from "./duel";

describe("pitch duel balance", () => {
  it("keeps each probability row normalized", () => {
    for (const target of PITCH_TARGETS) {
      const row = PITCH_TENDENCIES[target];
      expect(row.contact + row.foul + row.whiff).toBe(100);
      expect(row.ground + row.air + row.hit + row.homeRun).toBe(100);
      const rewarded = getBattedBallTendency(target, "batter");
      expect(
        rewarded.ground + rewarded.air + rewarded.hit + rewarded.homeRun,
      ).toBe(100);
      const suppressed = getBattedBallTendency(target, "pitcher");
      expect(
        suppressed.ground +
          suppressed.air +
          suppressed.hit +
          suppressed.homeRun,
      ).toBe(100);
    }
  });

  it("awards the simple 2x2 mind game to the correct side", () => {
    expect(resolveDuelWinner("strike", "swing")).toBe("batter");
    expect(resolveDuelWinner("strike", "take")).toBe("pitcher");
    expect(resolveDuelWinner("ball", "swing")).toBe("pitcher");
    expect(resolveDuelWinner("ball", "take")).toBe("batter");
  });

  it("strongly rewards the winner on a contacted pitch", () => {
    for (const target of PITCH_TARGETS) {
      const normal = getBattedBallTendency(target);
      const rewarded = getBattedBallTendency(target, "batter");
      expect(rewarded.hit + rewarded.homeRun).toBe(
        normal.hit + normal.homeRun + BATTER_DUEL_HIT_BONUS,
      );
    }

    for (const target of PITCH_TARGETS) {
      const normal = getBattedBallTendency(target);
      const suppressed = getBattedBallTendency(target, "pitcher");
      expect(suppressed.hit + suppressed.homeRun).toBe(
        normal.hit + normal.homeRun - PITCHER_DUEL_HIT_PENALTY,
      );
    }

    const values = [0.58, 0];
    let normalIndex = 0;
    let rewardedIndex = 0;
    expect(resolveBattedBall("strike", () => values[normalIndex++]!)).not.toBe(
      "HIT",
    );
    expect(
      resolveBattedBall("strike", () => values[rewardedIndex++]!, "batter"),
    ).toBe("HIT");

    let pitcherIndex = 0;
    expect(resolveBattedBall("ball", () => [0.82, 0][pitcherIndex++]!)).toBe(
      "HIT",
    );
    pitcherIndex = 0;
    expect(
      resolveBattedBall("ball", () => [0.82, 0][pitcherIndex++]!, "pitcher"),
    ).not.toBe("HIT");
  });

  it("makes takes deterministic and swings target-dependent", () => {
    expect(resolvePitchFace("ball", "take", () => 0.5)).toBe("B");
    expect(resolvePitchFace("strike", "take", () => 0.5)).toBe("S");
    expect(resolvePitchFace("strike", "swing", () => 0.1)).toBe("C");
    expect(resolvePitchFace("ball", "swing", () => 0.1)).toBe("F");
    expect(resolvePitchFace("ball", "swing", () => 0.9)).toBe("SM");
  });

  it("keeps actual pitches inside the intended semantic area", () => {
    for (const target of PITCH_TARGETS) {
      const values = [0, 0.25, 0.5, 0.75, 0.999];
      let index = 0;
      const location = createActualPitchLocation(
        target,
        3,
        () => values[index++ % values.length],
      );
      expect(location.pitchNumber).toBe(3);
      expect(location.zone).toBe(target === "ball" ? "ball" : "strike");
      expect(location.x).toBeGreaterThanOrEqual(0);
      expect(location.x).toBeLessThanOrEqual(100);
      expect(location.y).toBeGreaterThanOrEqual(0);
      expect(location.y).toBeLessThanOrEqual(100);
    }
  });

  it("creates reproducible locations and batted-ball results", () => {
    const values = [0.4, 0.2, 0.7, 0.1, 0.8, 0.3];
    const run = () => {
      let index = 0;
      const random = () => values[index++ % values.length];
      const actual = createActualPitchLocation("strike", 1, random);
      return {
        actual,
        batted: resolveBattedBall("strike", random),
      };
    };
    expect(run()).toEqual(run());
  });
});
