import { describe, expect, it } from "vitest";

import {
  buildPresentationCues,
  buildPresentationScenes,
  getAudioCues,
  getPresentationBases,
  getPitchLocation,
  getPlateAppearancePitchHistory,
} from "./presentation";
import { createGame, transition } from "./engine";
import { BATTING_DIE_FACES, HIT_DIE_FACES } from "./rules";
import type {
  Bases,
  BattingFace,
  GameEvent,
  HitFace,
  PitchFace,
  PresentationCue,
} from "./types";

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

const BASE_COMBINATIONS: Bases[] = Array.from({ length: 8 }, (_, mask) => ({
  first: Boolean(mask & 1),
  second: Boolean(mask & 2),
  third: Boolean(mask & 4),
}));

function emptyCardGame(
  phase: "awaiting_batting" | "awaiting_hit",
  bases: Bases,
  outs: 0 | 1 | 2,
) {
  const state = createGame({
    innings: 3,
    awayTeamName: "원정",
    homeTeamName: "홈",
  });
  state.phase = phase;
  state.bases = { ...bases };
  state.outs = outs;
  state.cards = {
    offense: { drawPile: [], hand: [], discardPile: [] },
    defense: { drawPile: [], hand: [], discardPile: [] },
  };
  return state;
}

function resolveForPresentation(
  face: BattingFace | HitFace,
  bases: Bases,
  outs: 0 | 1 | 2,
) {
  const battingFace = (BATTING_DIE_FACES as readonly string[]).includes(face);
  const state = emptyCardGame(
    battingFace ? "awaiting_batting" : "awaiting_hit",
    bases,
    outs,
  );
  const result = transition(
    state,
    battingFace
      ? { type: "BATTING_RESULT", face: face as BattingFace }
      : { type: "HIT_RESULT", face: face as HitFace },
  );
  if (!result.ok) throw new Error(result.error.message);
  return buildPresentationCues(result.events);
}

describe("catcher-view-v1 presentation", () => {
  it.each(
    BASE_COMBINATIONS.flatMap((bases) =>
      ([0, 1, 2] as const).flatMap((outs) =>
        [...new Set(BATTING_DIE_FACES), ...new Set(HIT_DIE_FACES)].map(
          (face) => [bases, outs, face] as const,
        ),
      ),
    ),
  )(
    "only animates runners that exist for bases %o, %i outs, %s",
    (bases, outs, face) => {
      const cues = resolveForPresentation(face, bases, outs);
      const runnerCues = cues.filter(
        (cue): cue is Extract<PresentationCue, { type: "runner_move" }> =>
          cue.type === "runner_move",
      );

      for (const cue of runnerCues) {
        if (cue.move.runner === "batter") continue;
        expect(bases[cue.move.runner]).toBe(true);
      }

      for (const cue of runnerCues) {
        expect(cue.path).toMatch(/^M\d+ \d+ [LQ]/);
        expect(cue.path).not.toBe(
          `M${cue.origin.x} ${cue.origin.y} L${cue.origin.x} ${cue.origin.y}`,
        );
      }

      const tagUps = runnerCues.filter((cue) => cue.action === "tag_up");
      if (tagUps.length > 0) {
        expect(["F2", "F3", "FA"]).toContain(face);
        expect(outs).toBeLessThan(2);
      }

      const firstSafeMove = runnerCues.findIndex(
        (cue) => cue.move.to !== "out",
      );
      const lastOutMove = runnerCues.findLastIndex(
        (cue) => cue.move.to === "out",
      );
      if (firstSafeMove >= 0 && lastOutMove >= 0) {
        expect(lastOutMove).toBeLessThan(firstSafeMove);
      }
    },
  );

  it("groups a revision into a deterministic RTS-style scene", () => {
    const events = [
      event({
        sequence: 7,
        revision: 4,
        kind: "pitch_result",
        face: "C",
        pitchTarget: "strike",
        swingDecision: "swing",
      }),
      event({
        sequence: 8,
        revision: 4,
        kind: "batted_ball",
        face: "GF",
      }),
    ];

    const [scene] = buildPresentationScenes(events);

    expect(scene).toMatchObject({
      id: "scene-4-7-8",
      revision: 4,
      template: "ground_play",
      camera: "field",
    });
    expect(scene.beats.map((beat) => beat.phase)).toEqual([
      "anticipation",
      "anticipation",
      "action",
      "resolution",
      "impact",
    ]);
    expect(scene.durationMs).toBe(
      scene.beats.reduce(
        (total, beat) => total + beat.durationMs + beat.holdMs,
        0,
      ),
    );
    expect(buildPresentationScenes(events)).toEqual([scene]);
  });

  it("keeps separate revisions as ordered scenes", () => {
    const scenes = buildPresentationScenes([
      event({ sequence: 1, revision: 2, kind: "pitch_result", face: "S" }),
      event({ sequence: 2, revision: 3, face: "FO", die: "batting" }),
    ]);

    expect(scenes.map((scene) => scene.revision)).toEqual([2, 3]);
    expect(scenes.map((scene) => scene.template)).toEqual([
      "pitch_duel",
      "fly_play",
    ]);
  });

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

  it("does not invent a tag-up or runner animation on an empty-base fly ball", () => {
    const cues = buildPresentationCues([
      event({ sequence: 1, kind: "batted_ball", face: "F2" }),
      event({
        sequence: 2,
        kind: "plate_appearance",
        summary: "외야 플라이 아웃",
        outsRecorded: 1,
        moves: [{ runner: "batter", from: "batter", to: "out" }],
      }),
    ]);

    expect(cues.map((cue) => cue.type)).toEqual([
      "batted_ball",
      "catch",
      "decision",
    ]);
    expect(cues[0]).toMatchObject({ label: "외야 플라이" });
    expect(cues.some((cue) => cue.type === "runner_move")).toBe(false);
  });

  it("orders representative batted plays from contact through the final call", () => {
    const forcePlay = resolveForPresentation(
      "GF",
      { first: true, second: false, third: false },
      0,
    );
    expect(
      forcePlay.map((cue) =>
        cue.type === "runner_move" ? `${cue.type}:${cue.action}` : cue.type,
      ),
    ).toEqual([
      "batted_ball",
      "runner_move:force_play",
      "throw",
      "decision",
      "runner_move:batter_run",
      "decision",
    ]);

    const tagUp = resolveForPresentation(
      "F3",
      { first: false, second: false, third: true },
      0,
    );
    expect(
      tagUp.map((cue) =>
        cue.type === "runner_move" ? `${cue.type}:${cue.action}` : cue.type,
      ),
    ).toEqual([
      "batted_ball",
      "catch",
      "decision",
      "runner_move:tag_up",
      "decision",
    ]);

    const single = resolveForPresentation(
      "L2",
      { first: true, second: true, third: true },
      0,
    );
    expect(
      single
        .filter(
          (cue): cue is Extract<PresentationCue, { type: "runner_move" }> =>
            cue.type === "runner_move",
        )
        .map((cue) => cue.move),
    ).toEqual([
      { runner: "third", from: "third", to: "home" },
      { runner: "second", from: "second", to: "home" },
      { runner: "first", from: "first", to: "second" },
      { runner: "batter", from: "batter", to: "first" },
    ]);
  });

  it("adds a tag-up scene only for a runner contained in the outcome", () => {
    const cues = buildPresentationCues([
      event({ sequence: 1, kind: "batted_ball", face: "F2" }),
      event({
        sequence: 2,
        kind: "plate_appearance",
        summary: "F2 태그업",
        outsRecorded: 1,
        moves: [
          { runner: "batter", from: "batter", to: "out" },
          { runner: "second", from: "second", to: "third" },
        ],
      }),
    ]);

    expect(cues.filter((cue) => cue.type === "runner_move")).toEqual([
      expect.objectContaining({
        action: "tag_up",
        move: { runner: "second", from: "second", to: "third" },
      }),
    ]);
  });

  it("carries the batted-ball context into a later card response revision", () => {
    const scenes = buildPresentationScenes([
      event({
        sequence: 1,
        revision: 1,
        kind: "batted_ball",
        face: "FA",
      }),
      event({
        sequence: 2,
        revision: 2,
        kind: "card_play",
        cardId: "AHF",
        cardRole: "defense",
      }),
      event({
        sequence: 3,
        revision: 2,
        kind: "plate_appearance",
        summary: "홈 보살",
        outsRecorded: 2,
        moves: [
          { runner: "batter", from: "batter", to: "out" },
          { runner: "third", from: "third", to: "out" },
        ],
      }),
    ]);
    const responseCues = scenes[1].beats.map((beat) => beat.cue);

    expect(responseCues.filter((cue) => cue.type === "runner_move")).toEqual([
      expect.objectContaining({
        action: "tag_up",
        move: { runner: "third", from: "third", to: "out" },
      }),
    ]);
    expect(
      responseCues.some(
        (cue) => cue.type === "runner_move" && cue.move.runner === "batter",
      ),
    ).toBe(false);
  });

  it("shows a line-drive catch before the runner is doubled off", () => {
    const scenes = buildPresentationScenes([
      event({
        sequence: 1,
        revision: 1,
        kind: "batted_ball",
        face: "HIT",
      }),
      event({
        sequence: 2,
        revision: 2,
        kind: "card_resolve",
        cardId: "LDP",
        cardRole: "defense",
      }),
      event({
        sequence: 3,
        revision: 2,
        kind: "plate_appearance",
        summary: "직선타 병살",
        outsRecorded: 2,
        moves: [
          { runner: "batter", from: "batter", to: "out" },
          { runner: "first", from: "first", to: "out", outAt: "first" },
        ],
      }),
    ]);
    const responseCues = scenes[1].beats.map((beat) => beat.cue);

    expect(responseCues.map((cue) => cue.type)).toEqual([
      "catch",
      "decision",
      "runner_move",
      "throw",
      "decision",
    ]);
    expect(responseCues[2]).toMatchObject({
      type: "runner_move",
      action: "pickoff_return",
      move: { runner: "first", from: "first", to: "out", outAt: "first" },
      destination: { x: 540, y: 560 },
    });
    expect(responseCues[2]).not.toMatchObject({
      origin: { x: 540, y: 560 },
    });
  });

  it("shows a foul catch without inventing a batter run or throw", () => {
    const cues = buildPresentationCues([
      event({ kind: "card_resolve", cardId: "FFO", cardRole: "defense" }),
      event({
        sequence: 2,
        kind: "plate_appearance",
        summary: "파울 플라이 아웃",
        outsRecorded: 1,
        moves: [{ runner: "batter", from: "batter", to: "out" }],
      }),
    ]);

    expect(cues.map((cue) => cue.type)).toEqual(["catch", "decision"]);
  });

  it("collapses the intermediate HIT result when its final lane is known", () => {
    const cues = buildPresentationCues([
      event({ sequence: 1, kind: "batted_ball", face: "HIT" }),
      event({ sequence: 2, kind: "batted_ball", face: "L1" }),
      event({
        sequence: 3,
        kind: "plate_appearance",
        summary: "L1 단타",
        moves: [{ runner: "batter", from: "batter", to: "first" }],
      }),
    ]);

    expect(cues.filter((cue) => cue.type === "batted_ball")).toEqual([
      expect.objectContaining({ face: "L1", label: "외야 안타" }),
    ]);
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

  it("runs extra-base hits and home runs around the base paths", () => {
    const double = resolveForPresentation(
      "D3",
      { first: false, second: false, third: false },
      0,
    ).find(
      (cue): cue is Extract<PresentationCue, { type: "runner_move" }> =>
        cue.type === "runner_move" && cue.move.runner === "batter",
    );
    const homeRun = resolveForPresentation(
      "HR",
      { first: false, second: false, third: false },
      0,
    ).find(
      (cue): cue is Extract<PresentationCue, { type: "runner_move" }> =>
        cue.type === "runner_move" && cue.move.runner === "batter",
    );

    expect(double?.path).toBe("M450 650 L540 560 L450 470");
    expect(homeRun?.path).toBe("M450 650 L540 560 L450 470 L360 560 L450 650");
  });

  it("uses the recorded assist base instead of guessing the next base", () => {
    const cues = buildPresentationCues([
      event({ kind: "batted_ball", face: "R2" }),
      event({
        sequence: 2,
        kind: "plate_appearance",
        summary: "3루 보살",
        outsRecorded: 1,
        moves: [
          { runner: "first", from: "first", to: "out", outAt: "third" },
          { runner: "batter", from: "batter", to: "first" },
        ],
      }),
    ]);
    const assistedRunner = cues.find(
      (cue): cue is Extract<PresentationCue, { type: "runner_move" }> =>
        cue.type === "runner_move" && cue.move.runner === "first",
    );
    const assistThrow = cues.find(
      (cue): cue is Extract<PresentationCue, { type: "throw" }> =>
        cue.type === "throw",
    );

    expect(assistedRunner).toMatchObject({
      destination: { x: 360, y: 560 },
      path: "M540 560 L450 470 L360 560",
    });
    expect(assistThrow).toMatchObject({
      to: { x: 360, y: 560 },
    });
    expect(assistThrow?.path).toContain(" Q");
  });

  it("does not invent a run or throw when a runner is hit by the ball", () => {
    const cues = buildPresentationCues([
      event({ kind: "batted_ball", face: "GF" }),
      event({ kind: "card_resolve", cardId: "RHB", cardRole: "defense" }),
      event({
        sequence: 3,
        kind: "plate_appearance",
        summary: "타구에 맞은 주자 아웃 · 타자 세이프",
        outsRecorded: 1,
        moves: [
          { runner: "first", from: "first", to: "out", outAt: "first" },
          { runner: "batter", from: "batter", to: "first" },
        ],
      }),
    ]);

    expect(
      cues.some(
        (cue) => cue.type === "runner_move" && cue.move.runner === "first",
      ),
    ).toBe(false);
    expect(cues.some((cue) => cue.type === "throw")).toBe(false);
    expect(cues).toContainEqual({
      type: "decision",
      result: "out",
      label: "타구 맞음 · 주자 아웃",
      camera: "field",
    });
  });

  it("shows a pickoff error as an off-line throw before runners advance", () => {
    const cues = buildPresentationCues([
      event({
        kind: "card_resolve",
        cardId: "POE",
        summary: "견제 송구 실책 · 모든 주자 진루",
        moves: [{ runner: "first", from: "first", to: "second" }],
      }),
    ]);

    expect(cues.map((cue) => cue.type)).toEqual([
      "throw",
      "runner_move",
      "decision",
    ]);
    expect(cues[0]).toMatchObject({
      type: "throw",
      kind: "error",
      label: "견제 악송구",
    });
    expect(cues[0]).not.toMatchObject({ to: { x: 540, y: 560 } });
  });

  it("plays throw audio only when the recorded out has a throw destination", () => {
    const caughtFly = event({
      kind: "plate_appearance",
      summary: "외야 플라이 아웃",
      outsRecorded: 1,
      moves: [{ runner: "batter", from: "batter", to: "out" }],
    });
    const groundOut = event({
      kind: "plate_appearance",
      summary: "땅볼 아웃",
      outsRecorded: 1,
      moves: [{ runner: "batter", from: "batter", to: "out", outAt: "first" }],
    });
    const runnerHit = event({
      kind: "plate_appearance",
      summary: "타구에 맞은 주자 아웃 · 타자 세이프",
      outsRecorded: 1,
      moves: [{ runner: "first", from: "first", to: "out", outAt: "first" }],
    });

    expect(getAudioCues([caughtFly])).toEqual(["out"]);
    expect(getAudioCues([groundOut])).toEqual(["throw", "out"]);
    expect(getAudioCues([runnerHit])).toEqual(["out"]);
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
      action: "pickoff_return",
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
