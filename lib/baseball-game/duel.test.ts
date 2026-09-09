import { describe, expect, it } from "vitest";

import {
  createActualPitchLocation,
  createPitchHint,
  PITCH_TARGETS,
  PITCH_TENDENCIES,
  resolveBattedBall,
  resolvePitchFace,
} from "./duel";

describe("pitch duel balance", () => {
  it("keeps each probability row normalized", () => {
    for (const target of PITCH_TARGETS) {
      const row = PITCH_TENDENCIES[target];
      expect(row.contact + row.foul + row.whiff).toBe(100);
      expect(row.ground + row.air + row.hit + row.homeRun).toBe(100);
    }
  });

  it("makes takes deterministic and swings target-dependent", () => {
    expect(resolvePitchFace("ball", "take", () => 0.5)).toBe("B");
    expect(resolvePitchFace("high_inside", "take", () => 0.5)).toBe("S");
    expect(resolvePitchFace("high_inside", "swing", () => 0.1)).toBe("C");
    expect(resolvePitchFace("ball", "swing", () => 0.2)).toBe("F");
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

  it("creates reproducible hint and batted-ball results", () => {
    const values = [0.4, 0.2, 0.7, 0.1, 0.8, 0.3];
    const run = () => {
      let index = 0;
      const random = () => values[index++ % values.length];
      const actual = createActualPitchLocation("low_outside", 1, random);
      return {
        actual,
        hint: createPitchHint("low_outside", actual, random),
        batted: resolveBattedBall("low_outside", random),
      };
    };
    expect(run()).toEqual(run());
  });
});
