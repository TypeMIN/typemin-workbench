import { describe, expect, it } from "vitest";

import {
  createGame,
  getActionOwner,
  getGameView,
  getLegalActions,
  getLegalCards,
  transition,
} from "./engine";
import { CARD_DECK_COUNTS, CARD_DEFINITIONS } from "./cards";
import {
  BATTING_DIE_FACES,
  HIT_DIE_FACES,
  PITCH_DIE_FACES,
  rollDie,
} from "./rules";
import type {
  Bases,
  BattingFace,
  CardId,
  CardRole,
  CardTiming,
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
    cards: overrides.cards ?? {
      offense: { drawPile: [], hand: [], discardPile: [] },
      defense: { drawPile: [], hand: [], discardPile: [] },
    },
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
    let state = pitch(game(), "C");
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
    const replay = () => actions.reduce(apply, game());
    expect(replay()).toEqual(replay());
  });
});

function cardState({
  bases = { first: false, second: false, third: false },
  offense = [],
  defense = [],
  timing,
  pendingResolution = null,
  priorityOrder,
  respondingTo = null,
  overrides = {},
}: {
  bases?: Bases;
  offense?: CardId[];
  defense?: CardId[];
  timing: CardTiming;
  pendingResolution?: GameState["pendingResolution"];
  priorityOrder?: CardRole[];
  respondingTo?: { cardId: CardId; role: CardRole } | null;
  overrides?: Partial<GameState>;
}) {
  const instances = (role: CardRole, cards: CardId[]) =>
    cards.map((cardId, index) => ({
      instanceId: `${role}-${cardId}-test-${index}`,
      cardId,
    }));
  const order =
    priorityOrder ??
    (timing === "after_batting"
      ? (["defense", "offense"] as CardRole[])
      : (["offense", "defense"] as CardRole[]));
  return game({
    ...overrides,
    phase: "awaiting_card",
    bases,
    cards: {
      offense: {
        drawPile: [],
        hand: instances("offense", offense),
        discardPile: [],
      },
      defense: {
        drawPile: [],
        hand: instances("defense", defense),
        discardPile: [],
      },
    },
    cardWindow: {
      timing,
      priorityOrder: order,
      priorityIndex: 0,
      respondingTo: respondingTo
        ? {
            instanceId: `${respondingTo.role}-${respondingTo.cardId}-primary`,
            ...respondingTo,
          }
        : null,
    },
    pendingResolution,
  });
}

function playCardId(state: GameState, cardId: CardId) {
  const card = getLegalCards(state).find(
    (item) => item.instance.cardId === cardId && item.playable,
  );
  if (!card) throw new Error(`${cardId} 카드를 사용할 수 없습니다.`);
  return apply(state, {
    type: "PLAY_CARD",
    cardInstanceId: card.instance.instanceId,
  });
}

const PRIMARY_CARD_SCENARIOS = [
  ["HBP", "offense", "after_pitch", { kind: "pitch", face: "B" }],
  ["WP", "offense", "after_pitch", { kind: "pitch", face: "B" }],
  ["BK", "offense", "before_pitch", null],
  ["SB2", "offense", "after_pitch", { kind: "pitch", face: "S" }],
  ["SB3", "offense", "after_pitch", { kind: "pitch", face: "SM" }],
  ["SBH", "offense", "after_pitch", { kind: "pitch", face: "B" }],
  ["SB", "offense", "after_contact", { kind: "contact" }],
  ["E", "offense", "after_batting", { kind: "batting", face: "GA" }],
  ["GDP", "defense", "after_batting", { kind: "batting", face: "GF" }],
  ["PO1", "defense", "before_pitch", null],
  ["PO2", "defense", "before_pitch", null],
  ["GBH", "defense", "after_batting", { kind: "batting", face: "GA" }],
] as const;

describe("cards-v1 strategy cards", () => {
  it("builds the exact starter decks and deterministic four-card hands", () => {
    const first = createGame(CONFIG, { seed: 20260904 });
    const replay = createGame(CONFIG, { seed: 20260904 });
    const total = (role: CardRole) => [
      ...first.cards[role].drawPile,
      ...first.cards[role].hand,
      ...first.cards[role].discardPile,
    ];

    expect(first).toEqual(replay);
    expect(first.cards.offense.hand).toHaveLength(4);
    expect(first.cards.defense.hand).toHaveLength(4);
    expect(total("offense")).toHaveLength(25);
    expect(total("defense")).toHaveLength(21);
    for (const role of ["offense", "defense"] as const) {
      for (const cardId of CARD_DECK_COUNTS[role]) {
        expect(
          total(role).filter((card) => card.cardId === cardId),
        ).toHaveLength(CARD_DEFINITIONS[cardId].copies);
      }
    }
  });

  it("redacts hands for public and opposing viewers", () => {
    const state = createGame(CONFIG, { seed: 7 });
    const publicView = getGameView(state, "public");
    expect(publicView.cards.offense.hand).toBeNull();
    expect(publicView).not.toHaveProperty("rng");
    expect(getGameView(state, "away").cards.offense.hand).toHaveLength(4);
    expect(getGameView(state, "away").cards.defense.hand).toBeNull();
    expect(getGameView(state, "home").cards.defense.hand).toHaveLength(4);
    expect(getGameView(state, "debug").cards.offense.hand).toHaveLength(4);
  });

  it.each([
    ["HBP", "offense", "after_pitch", { kind: "pitch", face: "B" }, {}],
    [
      "WP",
      "offense",
      "after_pitch",
      { kind: "pitch", face: "B" },
      { first: true },
    ],
    ["BK", "offense", "before_pitch", null, { first: true }],
    [
      "SB2",
      "offense",
      "after_pitch",
      { kind: "pitch", face: "S" },
      { first: true },
    ],
    [
      "SB3",
      "offense",
      "after_pitch",
      { kind: "pitch", face: "SM" },
      { second: true },
    ],
    [
      "SBH",
      "offense",
      "after_pitch",
      { kind: "pitch", face: "B" },
      { third: true },
    ],
    ["SB", "offense", "after_contact", { kind: "contact" }, { first: true }],
    ["E", "offense", "after_batting", { kind: "batting", face: "GA" }, {}],
    [
      "GDP",
      "defense",
      "after_batting",
      { kind: "batting", face: "GF" },
      { first: true },
    ],
    ["PO1", "defense", "before_pitch", null, { first: true }],
    ["PO2", "defense", "before_pitch", null, { second: true }],
    [
      "GBH",
      "defense",
      "after_batting",
      { kind: "batting", face: "GA" },
      { second: true },
    ],
  ] as const)(
    "recognizes %s as playable in its documented primary window",
    (cardId, role, timing, pendingResolution, partialBases) => {
      const state = cardState({
        bases: { first: false, second: false, third: false, ...partialBases },
        offense: role === "offense" ? [cardId] : [],
        defense: role === "defense" ? [cardId] : [],
        timing,
        pendingResolution,
        priorityOrder: [role],
      });
      expect(getLegalCards(state, role)).toEqual([
        expect.objectContaining({
          instance: expect.objectContaining({ cardId }),
          playable: true,
          reason: null,
        }),
      ]);
    },
  );

  it.each([
    ["POE", "offense", "PO1", "defense", "before_pitch"],
    ["CS2", "defense", "SB2", "offense", "after_pitch"],
    ["CS3", "defense", "SB3", "offense", "after_pitch"],
    ["CSH", "defense", "SBH", "offense", "after_pitch"],
    ["BD", "defense", "SB", "offense", "after_contact"],
  ] as const)(
    "recognizes %s as the matching response to %s",
    (cardId, role, primaryId, primaryRole, timing) => {
      const state = cardState({
        offense: role === "offense" ? [cardId] : [],
        defense: role === "defense" ? [cardId] : [],
        timing,
        respondingTo: { cardId: primaryId, role: primaryRole },
      });
      expect(getLegalCards(state, role)[0]).toMatchObject({
        instance: { cardId },
        playable: true,
        reason: null,
      });
    },
  );

  it("refills used cards, recycles discards, and redraws at side changes", () => {
    let state = cardState({
      bases: { first: true, second: false, third: false },
      offense: ["BK", "HBP", "WP", "SB2"],
      timing: "before_pitch",
      priorityOrder: ["offense"],
    });
    state.cards.offense.discardPile = [
      { instanceId: "offense-E-recycle", cardId: "E" },
    ];
    state = playCardId(state, "BK");
    expect(state.cards.offense.hand).toHaveLength(4);
    expect(
      [
        ...state.cards.offense.hand,
        ...state.cards.offense.drawPile,
        ...state.cards.offense.discardPile,
      ].map((card) => card.cardId),
    ).toContain("E");

    const sideChange = pitch(
      game({
        outs: 2,
        strikes: 2,
        cards: createGame(CONFIG, { seed: 99 }).cards,
      }),
      "S",
    );
    expect(sideChange.half).toBe("bottom");
    expect(sideChange.cards.offense.hand).toHaveLength(4);
    expect(sideChange.cards.defense.hand).toHaveLength(4);
    for (const role of ["offense", "defense"] as const) {
      const all = [
        ...sideChange.cards[role].drawPile,
        ...sideChange.cards[role].hand,
        ...sideChange.cards[role].discardPile,
      ];
      expect(new Set(all.map((card) => card.instanceId)).size).toBe(all.length);
    }
  });

  it("rejects an unavailable card without changing revision", () => {
    const state = cardState({
      timing: "before_pitch",
      offense: ["HBP"],
    });
    const result = transition(state, {
      type: "PLAY_CARD",
      cardInstanceId: state.cards.offense.hand[0].instanceId,
    });
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
    expect(result.state.revision).toBe(0);
  });

  it.each(
    BASE_COMBINATIONS.flatMap((bases) =>
      ([0, 1, 2] as const).flatMap((outs) =>
        PRIMARY_CARD_SCENARIOS.map(
          ([cardId, role, timing, pendingResolution]) =>
            [bases, outs, cardId, role, timing, pendingResolution] as const,
        ),
      ),
    ),
  )(
    "keeps card invariants for bases %o, %i outs, %s",
    (bases, outs, cardId, role, timing, pendingResolution) => {
      const state = cardState({
        bases,
        offense: role === "offense" ? [cardId] : [],
        defense: role === "defense" ? [cardId] : [],
        timing,
        pendingResolution,
        priorityOrder: [role],
        overrides: { outs },
      });
      const card = getLegalCards(state, role)[0];
      if (!card.playable) {
        expect(card.reason).toBeTruthy();
        return;
      }
      const next = playCardId(state, cardId);
      expect([true, false]).toContain(next.bases.first);
      expect([true, false]).toContain(next.bases.second);
      expect([true, false]).toContain(next.bases.third);
      expect([0, 1, 2]).toContain(next.outs);
      expect(next.score.away).toBeGreaterThanOrEqual(0);
      expect(next.revision).toBe(1);
    },
  );

  it("chains a wild pitch and steal response before applying the ball", () => {
    let state = cardState({
      bases: { first: true, second: false, third: true },
      offense: ["SB2", "WP"],
      defense: ["CS2"],
      timing: "after_pitch",
      pendingResolution: { kind: "pitch", face: "B" },
      priorityOrder: ["offense"],
    });
    expect(getActionOwner(state)).toBe("away");
    state = playCardId(state, "SB2");
    expect(getActionOwner(state)).toBe("home");
    state = playCardId(state, "CS2");
    expect(state.bases).toEqual({ first: false, second: false, third: true });
    state = playCardId(state, "WP");
    expect(state.score.away).toBe(1);
    expect(state.balls).toBe(1);
    expect(state.phase).toBe("awaiting_pitch");
  });

  it("uses POE to reverse a pickoff and refills both cards", () => {
    let state = cardState({
      bases: { first: true, second: false, third: false },
      offense: ["BK", "POE"],
      defense: ["PO1"],
      timing: "before_pitch",
      priorityOrder: ["defense"],
    });
    state = playCardId(state, "PO1");
    state = playCardId(state, "POE");
    expect(state.bases).toEqual({ first: false, second: true, third: false });
    expect(state.outs).toBe(0);
    expect(state.eventLog.map((event) => event.cardId)).toContain("POE");
  });

  it("resolves sacrifice bunt defense and ground-ball error responses", () => {
    let bunt = cardState({
      bases: { first: true, second: true, third: false },
      offense: ["SB"],
      defense: ["BD"],
      timing: "after_contact",
      pendingResolution: { kind: "contact" },
      priorityOrder: ["offense"],
    });
    bunt = playCardId(bunt, "SB");
    bunt = playCardId(bunt, "BD");
    expect(bunt.bases).toEqual({ first: true, second: true, third: false });
    expect(bunt.outs).toBe(1);

    let ground = cardState({
      bases: { first: true, second: true, third: false },
      offense: ["E"],
      defense: ["GDP"],
      timing: "after_batting",
      pendingResolution: { kind: "batting", face: "GA" },
    });
    ground = playCardId(ground, "GDP");
    ground = playCardId(ground, "E");
    expect(ground.outs).toBe(0);
    expect(ground.bases).toEqual({ first: true, second: true, third: true });
  });

  it("cancels a pending pitch on a card third out", () => {
    let state = cardState({
      bases: { first: true, second: false, third: false },
      offense: ["SB2"],
      defense: ["CS2"],
      timing: "after_pitch",
      pendingResolution: { kind: "pitch", face: "B" },
      priorityOrder: ["offense"],
      overrides: { outs: 2, balls: 2 },
    });
    state = playCardId(state, "SB2");
    state = playCardId(state, "CS2");
    expect(state.half).toBe("bottom");
    expect(state.balls).toBe(0);
    expect(state.pendingResolution).toBeNull();
  });

  it("finishes immediately on a walk-off home steal", () => {
    let state = cardState({
      bases: { first: false, second: false, third: true },
      offense: ["SBH"],
      timing: "after_pitch",
      pendingResolution: { kind: "pitch", face: "S" },
      priorityOrder: ["offense"],
      overrides: {
        inning: 3,
        half: "bottom",
        battingTeam: "home",
        score: { away: 0, home: 0 },
      },
    });
    state = playCardId(state, "SBH");
    expect(state.phase).toBe("finished");
    expect(state.winner).toBe("home");
    expect(state.pendingResolution).toBeNull();
  });
});
