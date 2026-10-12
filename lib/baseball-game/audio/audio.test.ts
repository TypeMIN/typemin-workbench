import { describe, expect, it } from "vitest";

import { createGame, getGameView, transition } from "../engine";
import { buildPresentationScenes } from "../presentation";
import type {
  GameEvent,
  GameState,
  PresentationBeat,
  PresentationCue,
  PresentationScene,
} from "../types";
import {
  getBeatSounds,
  getSceneAudioContext,
  type SceneAudioContext,
} from "./cues";
import { CLUTCH_LEVERAGE, getLeverage, isClutch } from "./leverage";

function beat(cue: PresentationCue, id = "beat"): PresentationBeat {
  return { id, phase: "action", cue, durationMs: 100, holdMs: 100 };
}

const topContext: SceneAudioContext = {
  battingTeam: "away",
  pitchFace: null,
  cardTiers: [],
  template: "generic",
  lastBeatId: null,
  walkOff: false,
};

function event(overrides: Partial<GameEvent>): GameEvent {
  return {
    sequence: 1,
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

describe("beat sounds", () => {
  it("clicks when the pitcher locks a concealed choice", () => {
    const sounds = getBeatSounds(
      beat({ type: "choice", actor: "pitcher", label: "", concealed: true }),
      topContext,
      "away",
    );
    expect(sounds.sfx).toEqual(["lock"]);
  });

  it("separates a swinging miss from a called strike", () => {
    const call = beat({ type: "call", call: "strike" });
    expect(
      getBeatSounds(call, { ...topContext, pitchFace: "SM" }, "away").sfx,
    ).toEqual(["whiff", "mitt"]);
    expect(
      getBeatSounds(call, { ...topContext, pitchFace: "S" }, "away").sfx,
    ).toEqual(["mitt"]);
  });

  it("makes each device's crowd react for its own team", () => {
    const homeRun = beat({
      type: "batted_ball",
      face: "HR",
      variation: 0,
      label: "",
    });
    expect(getBeatSounds(homeRun, topContext, "away").crowd).toBe("roar");
    expect(getBeatSounds(homeRun, topContext, "home").crowd).toBe("groan");
    expect(getBeatSounds(homeRun, topContext, "neutral").crowd).toBe("roar");

    const out = beat({
      type: "decision",
      result: "out",
      label: "",
      camera: "field",
    });
    expect(getBeatSounds(out, topContext, "home").crowd).toBe("cheer");
    expect(getBeatSounds(out, topContext, "away").crowd).toBe("groan");
  });

  it("only builds anticipation on a ball that might still be caught", () => {
    const fly = beat({
      type: "batted_ball",
      face: "FO",
      variation: 0,
      label: "",
    });
    expect(getBeatSounds(fly, topContext, "home").crowd).toBe("rise");
  });

  it("plays the card sting for the played card tier", () => {
    const sounds = getBeatSounds(
      beat({ type: "choice", actor: "defense", label: "병살" }),
      { ...topContext, cardTiers: ["advanced"] },
      "home",
    );
    expect(sounds.sfx).toEqual(["card_advanced"]);
  });

  it("closes an inning change and a walk-off on the scene's last beat", () => {
    const last = beat(
      { type: "decision", result: "score", label: "", camera: "field" },
      "last",
    );
    expect(
      getBeatSounds(
        last,
        { ...topContext, template: "inning_change", lastBeatId: "last" },
        "neutral",
      ).sfx,
    ).toContain("organ_inning");
    expect(
      getBeatSounds(
        last,
        {
          ...topContext,
          template: "game_end",
          lastBeatId: "last",
          walkOff: true,
        },
        "neutral",
      ).sfx,
    ).toContain("walk_off");
    expect(
      getBeatSounds(
        last,
        { ...topContext, template: "inning_change", lastBeatId: "other" },
        "neutral",
      ).sfx,
    ).not.toContain("organ_inning");
  });
});

describe("scene audio context", () => {
  it("reads the batting team, card tiers and walk-off from scene events", () => {
    const scene: PresentationScene = {
      id: "scene",
      revision: 4,
      template: "game_end",
      camera: "scoreboard",
      seed: 1,
      beats: [
        beat(
          {
            type: "pitch",
            face: "C",
            location: { x: 0, y: 0, zone: "strike", pitchNumber: 1 },
          },
          "b1",
        ),
      ],
      durationMs: 200,
    };
    const context = getSceneAudioContext(scene, [
      event({ revision: 3, half: "top" }),
      event({ revision: 4, half: "bottom", kind: "card_play", cardId: "HRC" }),
      event({ revision: 4, half: "bottom", runs: 1 }),
      event({ revision: 4, half: "bottom", kind: "game_end" }),
    ]);
    expect(context).toMatchObject({
      battingTeam: "home",
      pitchFace: "C",
      lastBeatId: "b1",
      walkOff: true,
    });
    expect(context.cardTiers).toHaveLength(1);
  });

  it("maps every beat of a real pitch scene without throwing", () => {
    let state: GameState = createGame(
      { innings: 3, awayTeamName: "원정", homeTeamName: "홈" },
      { seed: 11 },
    );
    for (const action of [
      { type: "SELECT_PITCH", target: "strike" },
      { type: "SELECT_SWING", decision: "swing" },
    ] as const) {
      const result = transition(state, action);
      if (!result.ok) throw new Error(result.error.message);
      state = result.state;
    }
    const scenes = buildPresentationScenes(state.eventLog);
    const sounds = scenes.flatMap((scene) => {
      const context = getSceneAudioContext(scene, state.eventLog);
      return scene.beats.flatMap(
        (item) => getBeatSounds(item, context, "away").sfx,
      );
    });
    expect(sounds).toContain("lock");
    expect(sounds).toContain("pitch");
  });
});

describe("leverage", () => {
  const base = getGameView(
    createGame({ innings: 9, awayTeamName: "원정", homeTeamName: "홈" }),
    "public",
  );

  it("stays calm in an empty first inning", () => {
    expect(getLeverage(base)).toBeLessThan(CLUTCH_LEVERAGE);
  });

  it("peaks with a walk-off chance in the last inning", () => {
    const jam = {
      ...base,
      inning: 9,
      half: "bottom" as const,
      outs: 2 as const,
      balls: 3 as const,
      strikes: 2 as const,
      bases: { first: true, second: true, third: true },
      score: { away: 3, home: 2 },
    };
    expect(getLeverage(jam)).toBe(1);
    expect(isClutch(jam)).toBe(true);
  });

  it("fades in a blowout even late", () => {
    const blowout = {
      ...base,
      inning: 9,
      bases: { first: false, second: false, third: false },
      score: { away: 9, home: 0 },
    };
    expect(isClutch(blowout)).toBe(false);
  });

  it("is silent once the game is over", () => {
    expect(getLeverage({ ...base, phase: "finished" })).toBe(0);
  });
});
