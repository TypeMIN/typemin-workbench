import { describe, expect, it } from "vitest";

import {
  buildPresentationCues,
  getPitchLocation,
  getPlateAppearancePitchHistory,
} from "./presentation";
import type { GameEvent, PitchFace } from "./types";

function event(overrides: Partial<GameEvent>): GameEvent {
  return {
    sequence: 1,
    revision: 1,
    inning: 1,
    half: "top",
    kind: "die_roll",
    summary: "",
    runs: 0,
    outsRecorded: 0,
    moves: [],
    ...overrides,
  };
}

describe("broadcast-v2 presentation", () => {
  it("uses the server-recorded duel location without re-randomizing it", () => {
    const source = event({
      kind: "pitch_result",
      face: "S",
      pitchLocation: { x: 42, y: 31, zone: "strike", pitchNumber: 4 },
    });
    expect(getPitchLocation(source, 4)).toEqual(source.pitchLocation);
    expect(buildPresentationCues([source]).at(0)).toEqual({
      type: "pitch",
      face: "S",
      location: source.pitchLocation,
    });
  });
  it.each(["S", "SM", "F", "B", "C"] as PitchFace[])(
    "creates a deterministic valid location for %s",
    (face) => {
      const source = event({ face, sequence: 14, revision: 9 });
      const first = getPitchLocation(source, 3);
      const second = getPitchLocation(source, 3);
      expect(first).toEqual(second);
      expect(first?.x).toBeGreaterThanOrEqual(0);
      expect(first?.x).toBeLessThanOrEqual(100);
      expect(first?.y).toBeGreaterThanOrEqual(0);
      expect(first?.y).toBeLessThanOrEqual(100);
      if (face === "B") expect(first?.zone).toBe("ball");
      else if (face === "F") expect(first?.zone).toBe("edge");
      else expect(["strike", "ball"]).toContain(first?.zone);
    },
  );

  it("keeps numbered pitches only for the current plate appearance", () => {
    const history = getPlateAppearancePitchHistory([
      event({ sequence: 1, face: "B", die: "pitch" }),
      event({ sequence: 2, kind: "plate_appearance" }),
      event({ sequence: 3, revision: 2, face: "S", die: "pitch" }),
      event({ sequence: 4, revision: 3, face: "F", die: "pitch" }),
    ]);
    expect(history.map((pitch) => pitch.location.pitchNumber)).toEqual([1, 2]);
    expect(history.map((pitch) => pitch.face)).toEqual(["S", "F"]);
  });

  it("orders pitch, call, throw and out for a strikeout", () => {
    const cues = buildPresentationCues([
      event({ sequence: 1, die: "pitch", face: "S" }),
      event({
        sequence: 2,
        kind: "plate_appearance",
        outsRecorded: 1,
        moves: [{ runner: "batter", from: "batter", to: "out" }],
      }),
    ]);
    expect(cues.map((cue) => cue.type)).toEqual([
      "pitch",
      "call",
      "throw",
      "decision",
    ]);
    expect(cues.at(-1)).toEqual({ type: "decision", result: "out" });
  });

  it("orders a batted ball before runner moves and scoring decisions", () => {
    const cues = buildPresentationCues([
      event({ sequence: 1, die: "batting", face: "HR" }),
      event({
        sequence: 2,
        kind: "plate_appearance",
        runs: 1,
        moves: [{ runner: "batter", from: "batter", to: "home" }],
      }),
    ]);
    expect(cues.map((cue) => cue.type)).toEqual([
      "batted_ball",
      "runner_move",
      "decision",
    ]);
    expect(cues.at(-1)).toEqual({ type: "decision", result: "score" });
  });

  it("represents a double play as two sequential throws and calls", () => {
    const cues = buildPresentationCues([
      event({ sequence: 1, die: "batting", face: "GF" }),
      event({
        sequence: 2,
        kind: "plate_appearance",
        outsRecorded: 2,
        moves: [
          { runner: "first", from: "first", to: "out" },
          { runner: "batter", from: "batter", to: "out" },
        ],
      }),
    ]);
    expect(cues.filter((cue) => cue.type === "throw")).toHaveLength(2);
    expect(cues.filter((cue) => cue.type === "decision")).toHaveLength(2);
  });
});
