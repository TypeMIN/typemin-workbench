import { describe, expect, it } from "vitest";

import {
  buildPresentationCues,
  getPresentationBases,
  getPitchLocation,
  getPlateAppearancePitchHistory,
} from "./presentation";
import type { GameEvent, PitchFace, PresentationCue } from "./types";

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

describe("catcher-view-v1 presentation", () => {
  it("reveals pitcher and batter choices one at a time before the pitch", () => {
    const cues = buildPresentationCues([
      event({
        kind: "pitch_result",
        face: "S",
        pitchTarget: "strike",
        swingDecision: "take",
      }),
    ]);
    expect(cues.slice(0, 4)).toEqual([
      { type: "choice", actor: "pitcher", label: "스트라이크" },
      { type: "choice", actor: "batter", label: "지켜보기" },
      expect.objectContaining({ type: "pitch", face: "S" }),
      { type: "call", call: "strike" },
    ]);
  });

  it("shows a played card before resolving its movement", () => {
    const cues = buildPresentationCues([
      event({
        kind: "card_play",
        cardId: "PO1",
        cardRole: "defense",
        summary: "수비 카드 · 1루 견제",
      }),
      event({
        sequence: 2,
        kind: "card_resolve",
        cardId: "PO1",
        summary: "1루 견제 성공",
        moves: [{ runner: "first", from: "first", to: "out" }],
      }),
    ]);
    expect(cues.slice(0, 4).map((cue) => cue.type)).toEqual([
      "choice",
      "throw",
      "runner_move",
      "decision",
    ]);
    expect(cues[0]).toEqual({
      type: "choice",
      actor: "defense",
      label: "1루 견제",
    });
  });
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
  it("moves legacy ball centers far enough out for the marker to clear the zone", () => {
    expect(
      getPitchLocation(
        event({
          kind: "pitch_result",
          face: "B",
          pitchLocation: {
            x: 23,
            y: 50,
            zone: "ball",
            pitchNumber: 2,
          },
        }),
        2,
      ),
    ).toMatchObject({ x: 12, y: 50, zone: "ball", pitchNumber: 2 });
  });

  it("varies a batted-ball lane deterministically with the preceding pitch", () => {
    const run = (x: number, y: number) =>
      buildPresentationCues([
        event({
          kind: "pitch_result",
          face: "C",
          pitchLocation: { x, y, zone: "strike", pitchNumber: 1 },
        }),
        event({ sequence: 2, kind: "batted_ball", face: "FO" }),
      ]).find(
        (cue): cue is Extract<PresentationCue, { type: "batted_ball" }> =>
          cue.type === "batted_ball",
      );

    const first = run(31, 32);
    const replay = run(31, 32);
    const otherPitch = run(68, 71);
    expect(first).toEqual(replay);
    expect(first?.variation).toBeGreaterThanOrEqual(-1);
    expect(first?.variation).toBeLessThanOrEqual(1);
    expect(otherPitch?.variation).not.toBe(first?.variation);
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

  it("keeps the completed at-bat visible until the next pitch starts", () => {
    const completed = [
      event({ sequence: 1, kind: "pitch_result", face: "S" }),
      event({ sequence: 2, kind: "pitch_result", face: "B" }),
      event({ sequence: 3, kind: "plate_appearance", outsRecorded: 1 }),
    ];

    expect(
      getPlateAppearancePitchHistory(completed).map((pitch) => pitch.face),
    ).toEqual(["S", "B"]);
    expect(
      getPlateAppearancePitchHistory([
        ...completed,
        event({ sequence: 4, kind: "pitch_commit" }),
      ]),
    ).toEqual([]);
  });

  it("keeps a strikeout at the catcher without inventing a throw", () => {
    const cues = buildPresentationCues([
      event({ sequence: 1, die: "pitch", face: "S" }),
      event({
        sequence: 2,
        kind: "plate_appearance",
        summary: "삼진 아웃",
        outsRecorded: 1,
        moves: [{ runner: "batter", from: "batter", to: "out" }],
      }),
    ]);
    expect(cues.map((cue) => cue.type)).toEqual(["pitch", "call", "decision"]);
    expect(cues.at(-1)).toEqual({
      type: "decision",
      result: "out",
      label: "삼진 아웃",
      camera: "catcher",
    });
  });

  it("orders a batted ball before runner moves and scoring decisions", () => {
    const cues = buildPresentationCues([
      event({ sequence: 1, die: "batting", face: "HR" }),
      event({
        sequence: 2,
        kind: "plate_appearance",
        summary: "홈런",
        runs: 1,
        moves: [{ runner: "batter", from: "batter", to: "home" }],
      }),
    ]);
    expect(cues.map((cue) => cue.type)).toEqual([
      "batted_ball",
      "runner_move",
      "decision",
    ]);
    expect(cues.at(-1)).toEqual({
      type: "decision",
      result: "score",
      label: "홈런",
      camera: "field",
    });
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

  it("animates a pickoff as a runner dive, pickoff throw and final out", () => {
    const cues = buildPresentationCues([
      event({
        kind: "card_resolve",
        cardId: "PO1",
        summary: "1루 견제 성공",
        outsRecorded: 1,
        moves: [{ runner: "first", from: "first", to: "out" }],
      }),
    ]);

    expect(cues.map((cue) => cue.type)).toEqual([
      "throw",
      "runner_move",
      "decision",
    ]);
    expect(cues[1]).toMatchObject({
      type: "runner_move",
      label: "1루 주자 · 1루 승부",
      destination: { x: 540, y: 560 },
    });
    expect(cues[1]).not.toMatchObject({ origin: { x: 540, y: 560 } });
    expect(cues[0]).toMatchObject({
      type: "throw",
      kind: "pickoff",
      label: "1루 견제",
      from: { x: 450, y: 560 },
      to: { x: 540, y: 560 },
    });
    expect(cues[2]).toEqual({
      type: "decision",
      result: "out",
      label: "1루 견제 성공",
      camera: "field",
    });
  });

  it("shows the catcher throwing to the attempted steal base", () => {
    const cues = buildPresentationCues([
      event({
        kind: "card_resolve",
        cardId: "CS2",
        summary: "2루 도루 저지 성공",
        outsRecorded: 1,
        moves: [{ runner: "first", from: "first", to: "out" }],
      }),
    ]);
    expect(cues[1]).toMatchObject({
      type: "throw",
      kind: "caught_stealing",
      from: { x: 450, y: 650 },
      to: { x: 450, y: 470 },
      label: "2루 도루 저지",
    });
  });

  it("moves every advancing runner before showing one final ruling", () => {
    const cues = buildPresentationCues([
      event({
        kind: "card_resolve",
        cardId: "WP",
        summary: "폭투 · 모든 주자 진루",
        runs: 1,
        moves: [
          { runner: "third", from: "third", to: "home" },
          { runner: "first", from: "first", to: "second" },
        ],
      }),
    ]);
    expect(cues.map((cue) => cue.type)).toEqual([
      "runner_move",
      "runner_move",
      "decision",
    ]);
    expect(cues.at(-1)).toMatchObject({
      type: "decision",
      result: "score",
      label: "폭투 · 모든 주자 진루",
    });
  });

  it("reveals occupied bases only when each runner scene completes", () => {
    const cues = buildPresentationCues([
      event({
        kind: "card_resolve",
        cardId: "WP",
        summary: "폭투 · 모든 주자 진루",
        moves: [
          { runner: "second", from: "second", to: "third" },
          { runner: "first", from: "first", to: "second" },
        ],
      }),
    ]);
    const finalBases = { first: false, second: true, third: true };

    expect(getPresentationBases(finalBases, cues, 0)).toEqual({
      first: true,
      second: true,
      third: false,
    });
    expect(getPresentationBases(finalBases, cues, 1)).toEqual({
      first: true,
      second: false,
      third: true,
    });
    expect(getPresentationBases(finalBases, cues, 2)).toEqual(finalBases);
  });

  it("does not truncate a long sequence before its final ruling", () => {
    const longPlay = Array.from({ length: 18 }, (_, index) =>
      event({
        sequence: index + 1,
        kind: "card_play",
        cardId: index % 2 === 0 ? "BK" : "WP",
        cardRole: index % 2 === 0 ? "defense" : "offense",
      }),
    );
    const cues = buildPresentationCues(longPlay);
    expect(cues).toHaveLength(18);
  });
});
