import type {
  AudioCue,
  Bases,
  BattingFace,
  CardId,
  FieldPoint,
  GameEvent,
  HitFace,
  PitchFace,
  PitchLocation,
  PresentationBeat,
  PresentationCue,
  PresentationScene,
  PresentationSceneCamera,
  PresentationSceneTemplate,
  RunnerDestination,
  RunnerMove,
  RunnerOrigin,
} from "./types";
import { CARD_DEFINITIONS } from "./cards";
import { placeBallOutsideStrikeZone } from "./duel";

const FIELD_POINTS: Record<RunnerOrigin | RunnerDestination, FieldPoint> = {
  batter: { x: 450, y: 650 },
  first: { x: 540, y: 560 },
  second: { x: 450, y: 470 },
  third: { x: 360, y: 560 },
  home: { x: 450, y: 650 },
  out: { x: 450, y: 560 },
};

const CATCH_POINTS: Record<BattingFace | HitFace, FieldPoint> = {
  GF: { x: 480, y: 550 },
  G3: { x: 382, y: 550 },
  GA: { x: 450, y: 525 },
  PO: { x: 450, y: 515 },
  FO: { x: 450, y: 270 },
  F2: { x: 315, y: 300 },
  F3: { x: 450, y: 250 },
  FA: { x: 585, y: 300 },
  HIT: { x: 450, y: 350 },
  HR: { x: 450, y: 112 },
  IH: { x: 472, y: 535 },
  L1: { x: 315, y: 390 },
  L2: { x: 270, y: 320 },
  C1: { x: 450, y: 360 },
  C2: { x: 450, y: 270 },
  R1: { x: 585, y: 390 },
  R2: { x: 630, y: 320 },
  D2: { x: 335, y: 250 },
  D3: { x: 565, y: 250 },
  T3: { x: 450, y: 160 },
};

export function getPitchLocation(
  event: Pick<GameEvent, "sequence" | "revision" | "face" | "pitchLocation">,
  pitchNumber = 1,
): PitchLocation | null {
  if (event.pitchLocation) {
    return keepBallMarkerOutsideStrikeZone(event.pitchLocation);
  }
  const face = event.face;
  if (
    face !== "S" &&
    face !== "SM" &&
    face !== "F" &&
    face !== "B" &&
    face !== "C"
  ) {
    return null;
  }
  const seed = hash(
    event.sequence * 131 + event.revision * 977 + face.charCodeAt(0),
  );
  const unitA = ((seed >>> 8) & 0xff) / 255;
  const unitB = ((seed >>> 16) & 0xff) / 255;

  if (face === "B" || (face === "SM" && seed % 3 === 0)) {
    const side = seed % 4;
    return placeBallOutsideStrikeZone(unitA, unitB, side, pitchNumber);
  }

  if (face === "F") {
    const side = seed % 4;
    const edge = 24 + unitA * 52;
    return side === 0
      ? { x: 24, y: edge, zone: "edge", pitchNumber }
      : side === 1
        ? { x: 76, y: edge, zone: "edge", pitchNumber }
        : side === 2
          ? { x: edge, y: 20, zone: "edge", pitchNumber }
          : { x: edge, y: 80, zone: "edge", pitchNumber };
  }

  return {
    x: 29 + unitA * 42,
    y: 24 + unitB * 52,
    zone: "strike",
    pitchNumber,
  };
}

function keepBallMarkerOutsideStrikeZone(
  location: PitchLocation,
): PitchLocation {
  if (location.zone !== "ball") return { ...location };
  const sides = [
    { side: "left" as const, score: 24 - location.x },
    { side: "right" as const, score: location.x - 76 },
    { side: "top" as const, score: 20 - location.y },
    { side: "bottom" as const, score: location.y - 80 },
  ].sort((a, b) => b.score - a.score);
  const side = sides[0].side;
  if (side === "left") return { ...location, x: Math.min(location.x, 12) };
  if (side === "right") return { ...location, x: Math.max(location.x, 88) };
  if (side === "top") return { ...location, y: Math.min(location.y, 8) };
  return { ...location, y: Math.max(location.y, 92) };
}

export function getPlateAppearancePitchHistory(events: GameEvent[]) {
  const latestPlateAppearance = events.reduce(
    (last, event, index) => (event.kind === "plate_appearance" ? index : last),
    -1,
  );
  const nextPitchStarted = events
    .slice(latestPlateAppearance + 1)
    .some(
      (event) =>
        event.kind === "pitch_commit" ||
        event.kind === "pitch_result" ||
        (event.kind === "die_roll" && event.die === "pitch"),
    );
  const previousPlateAppearance = events.reduce(
    (last, event, index) =>
      index < latestPlateAppearance && event.kind === "plate_appearance"
        ? index
        : last,
    -1,
  );
  const historyStart =
    latestPlateAppearance >= 0 && !nextPitchStarted
      ? previousPlateAppearance + 1
      : latestPlateAppearance + 1;
  const historyEnd =
    latestPlateAppearance >= 0 && !nextPitchStarted
      ? latestPlateAppearance
      : events.length;
  const pitchEvents = events
    .slice(historyStart, historyEnd)
    .filter(
      (event) =>
        event.kind === "pitch_result" ||
        (event.kind === "die_roll" && event.die === "pitch"),
    );
  const history: Array<{
    event: GameEvent;
    face: PitchFace;
    location: PitchLocation;
  }> = [];
  pitchEvents.forEach((event, index) => {
    const location = getPitchLocation(event, index + 1);
    if (!location || !isPitchFace(event.face)) return;
    const overlapCount = history.filter(
      (pitch) =>
        Math.abs(pitch.location.x - location.x) < 7 &&
        Math.abs(pitch.location.y - location.y) < 7,
    ).length;
    const displayedLocation = overlapCount
      ? {
          ...location,
          x: Math.max(3, Math.min(97, location.x + overlapCount * 3)),
          y: Math.max(3, Math.min(97, location.y + overlapCount * 2)),
        }
      : location;
    history.push({
      event,
      face: event.face,
      location: keepBallMarkerOutsideStrikeZone(displayedLocation),
    });
  });
  return history;
}

export function buildPresentationCues(
  events: GameEvent[],
  context: { battedFace?: BattingFace | HitFace | null } = {},
): PresentationCue[] {
  const cues: PresentationCue[] = [];
  let battedFace: BattingFace | HitFace | null = context.battedFace ?? null;
  let throwOrigin: FieldPoint = battedFace
    ? CATCH_POINTS[battedFace]
    : FIELD_POINTS.home;
  let latestPitchLocation: PitchLocation | null = null;
  let resolutionCardId: CardId | null = null;
  const pitchEventsBefore = events.filter(
    (event) =>
      event.kind === "pitch_result" ||
      (event.kind === "die_roll" && event.die === "pitch"),
  );
  const hasResolvedHit = events.some(
    (event) =>
      event.kind === "batted_ball" &&
      isBattedFace(event.face) &&
      event.face !== "HIT",
  );

  events.forEach((event) => {
    if (event.kind === "card_resolve" && event.cardId) {
      resolutionCardId = event.cardId;
    }
    if (event.kind === "pitch_commit") {
      cues.push({
        type: "choice",
        actor: "pitcher",
        label: "선택 완료",
        concealed: true,
      });
    }
    if (event.kind === "card_play" && event.cardId && event.cardRole) {
      cues.push({
        type: "choice",
        actor: event.cardRole,
        label: CARD_DEFINITIONS[event.cardId].name,
      });
    }
    if (
      (event.kind === "pitch_result" ||
        (event.kind === "die_roll" && event.die === "pitch")) &&
      isPitchFace(event.face)
    ) {
      if (event.pitchTarget) {
        cues.push({
          type: "choice",
          actor: "pitcher",
          label: event.pitchTarget === "strike" ? "스트라이크" : "볼",
        });
      }
      if (event.swingDecision) {
        cues.push({
          type: "choice",
          actor: "batter",
          label: event.swingDecision === "swing" ? "스윙" : "지켜보기",
        });
      }
      const pitchNumber =
        pitchEventsBefore.findIndex(
          (pitch) => pitch.sequence === event.sequence,
        ) + 1;
      const location = getPitchLocation(event, pitchNumber);
      if (location) {
        latestPitchLocation = location;
        cues.push({ type: "pitch", location, face: event.face });
      }
      cues.push({ type: "call", call: pitchCall(event.face) });
    }
    if (
      (event.kind === "batted_ball" ||
        (event.kind === "die_roll" &&
          (event.die === "batting" || event.die === "hit"))) &&
      isBattedFace(event.face) &&
      !(event.face === "HIT" && hasResolvedHit)
    ) {
      battedFace = event.face;
      throwOrigin = CATCH_POINTS[event.face];
      cues.push({
        type: "batted_ball",
        face: event.face,
        variation: battedBallVariation(event, latestPitchLocation),
        label: battedBallLabel(event.face),
      });
      if (isCaughtFace(event.face))
        cues.push({
          type: "catch",
          location: CATCH_POINTS[event.face],
          label: "타구 포구",
        });
    }
    if (
      event.kind === "card_resolve" &&
      event.cardId === "LDP" &&
      battedFace === "HIT"
    ) {
      throwOrigin = CATCH_POINTS.HIT;
      cues.push({
        type: "catch",
        location: CATCH_POINTS.HIT,
        label: "직선타 포구",
      });
    }
    if (event.kind === "card_resolve" && event.cardId === "FFO") {
      throwOrigin = CATCH_POINTS.PO;
      cues.push({
        type: "catch",
        location: CATCH_POINTS.PO,
        label: "파울 타구 포구",
      });
    }

    const outMoves = event.moves.filter((move) => move.to === "out");
    const safeMoves = event.moves
      .filter((move) => move.to !== "out")
      .sort(
        (left, right) =>
          runnerDestinationRank(right.to) - runnerDestinationRank(left.to) ||
          runnerOriginRank(right.from) - runnerOriginRank(left.from),
      );
    const orderedMoves = [...outMoves, ...safeMoves];
    for (const move of orderedMoves) {
      if (move.to === "out") {
        if (
          move.runner === "batter" &&
          ((battedFace && isCaughtFace(battedFace)) ||
            resolutionCardId === "LDP" ||
            resolutionCardId === "FFO" ||
            event.summary.includes("삼진"))
        ) {
          cues.push({
            type: "decision",
            result: "out",
            label:
              event.summary.includes("삼진") ||
              (outMoves.length === 1 && safeMoves.length === 0)
                ? event.summary || "타자 아웃"
                : "플라이 아웃",
            camera: event.summary.includes("삼진") ? "catcher" : "field",
          });
          continue;
        }
        if (resolutionCardId === "RHB" && move.runner !== "batter") {
          cues.push({
            type: "decision",
            result: "out",
            label: "타구 맞음 · 주자 아웃",
            camera: "field",
          });
          continue;
        }
        const destination = inferOutDestination(event, move);
        const kind = inferThrowKind(event);
        const action = inferRunnerAction(
          event,
          move,
          battedFace,
          kind,
          resolutionCardId,
        );
        const origin =
          kind === "pickoff" || action === "pickoff_return"
            ? leadOffPoint(move.from)
            : FIELD_POINTS[move.from];
        const runnerPath = buildRunnerPath(move, origin, destination, action);
        const throwFrom = inferThrowStart(event, kind, throwOrigin);
        const runnerCue: PresentationCue = {
          type: "runner_move",
          move,
          origin,
          destination,
          path: runnerPath,
          label: runnerMoveLabel(move.from, destination, true),
          action,
        };
        const throwCue: PresentationCue = {
          type: "throw",
          from: throwFrom,
          to: destination,
          path: buildThrowPath(throwFrom, destination),
          kind,
          label: throwLabel(event, destination, kind),
        };
        if (kind === "pickoff") cues.push(throwCue, runnerCue);
        else cues.push(runnerCue, throwCue);
        throwOrigin = destination;
        cues.push({
          type: "decision",
          result: "out",
          label:
            outMoves.at(-1) === move && safeMoves.length === 0
              ? event.summary || "주자 아웃"
              : `${baseName(destination)} 아웃`,
          camera: "field",
        });
      } else {
        const origin = FIELD_POINTS[move.from];
        const destination = FIELD_POINTS[move.to];
        const action = inferRunnerAction(
          event,
          move,
          battedFace,
          "throw",
          resolutionCardId,
        );
        cues.push({
          type: "runner_move",
          move,
          origin,
          destination,
          path: buildRunnerPath(move, origin, destination, action),
          label: runnerMoveLabel(move.from, destination, false),
          action,
        });
      }
    }
    if (event.cardId === "POE" && safeMoves.length > 0) {
      const pickoffBase = safeMoves.find((move) => move.to !== "home")?.from;
      if (pickoffBase && pickoffBase !== "batter") {
        const missedTarget = {
          x: FIELD_POINTS[pickoffBase].x + (pickoffBase === "first" ? 38 : -28),
          y: FIELD_POINTS[pickoffBase].y - 24,
        };
        cues.splice(Math.max(0, cues.length - safeMoves.length), 0, {
          type: "throw",
          from: FIELD_POINTS.out,
          to: missedTarget,
          path: buildThrowPath(FIELD_POINTS.out, missedTarget),
          kind: "error",
          label: "견제 악송구",
        });
      }
    }
    if (safeMoves.length > 0) {
      const scored = safeMoves.some((move) => move.to === "home");
      cues.push({
        type: "decision",
        result: scored ? "score" : "safe",
        label: event.summary || (scored ? "주자 득점" : "주자 세이프"),
        camera: "field",
      });
    }
  });

  return dedupeAdjacent(cues);
}

export function getPresentationDuration(events: GameEvent[]) {
  return buildPresentationScenes(events).reduce(
    (total, scene) => total + scene.durationMs,
    0,
  );
}

export function hasResolutionOutcome(events: GameEvent[]) {
  return events.some((event) =>
    [
      "pitch_result",
      "batted_ball",
      "die_roll",
      "card_resolve",
      "plate_appearance",
      "half_inning",
      "game_end",
    ].includes(event.kind),
  );
}

export function buildPresentationScenes(events: GameEvent[]) {
  const revisions = new Map<number, GameEvent[]>();
  for (const event of events) {
    const revisionEvents = revisions.get(event.revision) ?? [];
    revisionEvents.push(event);
    revisions.set(event.revision, revisionEvents);
  }

  let activeBattedFace: BattingFace | HitFace | null = null;
  return Array.from(revisions.entries()).flatMap(([revision, sceneEvents]) => {
    const cues = buildPresentationCues(sceneEvents, {
      battedFace: activeBattedFace,
    });
    for (const event of sceneEvents) {
      if (event.kind === "batted_ball" && isBattedFace(event.face)) {
        activeBattedFace = event.face;
      }
      if (
        event.kind === "plate_appearance" ||
        event.kind === "half_inning" ||
        event.kind === "game_end"
      ) {
        activeBattedFace = null;
      }
    }
    if (cues.length === 0) return [];
    const firstSequence = sceneEvents.at(0)?.sequence ?? 0;
    const lastSequence = sceneEvents.at(-1)?.sequence ?? firstSequence;
    const id = `scene-${revision}-${firstSequence}-${lastSequence}`;
    const beats = cues.map((cue, index) =>
      createPresentationBeat(id, cue, index),
    );
    const template = inferSceneTemplate(sceneEvents, cues);
    return [
      {
        id,
        revision,
        template,
        camera: inferSceneCamera(template, cues),
        seed: hash(revision * 977 + firstSequence * 131 + lastSequence * 31),
        beats,
        durationMs: beats.reduce(
          (total, beat) => total + beat.durationMs + beat.holdMs,
          0,
        ),
      } satisfies PresentationScene,
    ];
  });
}

export function getPresentationBases(
  finalBases: Bases,
  cues: PresentationCue[],
  activeIndex: number,
): Bases {
  const staged = { ...finalBases };
  for (let index = cues.length - 1; index >= activeIndex; index -= 1) {
    const cue = cues[index];
    if (cue.type !== "runner_move") continue;
    if (
      cue.move.to === "first" ||
      cue.move.to === "second" ||
      cue.move.to === "third"
    ) {
      staged[cue.move.to] = false;
    }
    if (cue.move.from !== "batter") staged[cue.move.from] = true;
  }
  return staged;
}

export function presentationCueDuration(cue: PresentationCue) {
  const timing = presentationCueTiming(cue);
  return timing.durationMs + timing.holdMs;
}

function createPresentationBeat(
  sceneId: string,
  cue: PresentationCue,
  index: number,
): PresentationBeat {
  return {
    id: `${sceneId}-beat-${index}`,
    phase: presentationBeatPhase(cue),
    cue,
    ...presentationCueTiming(cue),
  };
}

function presentationCueTiming(cue: PresentationCue) {
  if (cue.type === "choice") return { durationMs: 500, holdMs: 750 };
  if (cue.type === "pitch") return { durationMs: 700, holdMs: 150 };
  if (cue.type === "call") return { durationMs: 400, holdMs: 950 };
  if (cue.type === "batted_ball") return { durationMs: 850, holdMs: 200 };
  if (cue.type === "catch") return { durationMs: 650, holdMs: 300 };
  if (cue.type === "throw") return { durationMs: 850, holdMs: 250 };
  if (cue.type === "runner_move") return { durationMs: 850, holdMs: 250 };
  return { durationMs: 500, holdMs: 1_400 };
}

function presentationBeatPhase(
  cue: PresentationCue,
): PresentationBeat["phase"] {
  if (cue.type === "choice") return "anticipation";
  if (cue.type === "pitch" || cue.type === "runner_move") return "action";
  if (
    cue.type === "batted_ball" ||
    cue.type === "catch" ||
    cue.type === "throw"
  )
    return "impact";
  if (cue.type === "call") return "resolution";
  return "settle";
}

function inferSceneTemplate(
  events: GameEvent[],
  cues: PresentationCue[],
): PresentationSceneTemplate {
  if (events.some((event) => event.kind === "game_end")) return "game_end";
  if (events.some((event) => event.kind === "half_inning"))
    return "inning_change";
  if (
    events.some(
      (event) => event.kind === "card_play" || event.kind === "card_resolve",
    )
  )
    return "card_action";
  const batted = cues.find(
    (cue): cue is Extract<PresentationCue, { type: "batted_ball" }> =>
      cue.type === "batted_ball",
  );
  if (batted) {
    if (["GF", "G3", "GA", "IH"].includes(batted.face)) return "ground_play";
    if (["PO", "FO", "F2", "F3", "FA"].includes(batted.face)) return "fly_play";
    return "hit_play";
  }
  if (
    cues.some(
      (cue) =>
        cue.type === "throw" ||
        cue.type === "runner_move" ||
        cue.type === "catch",
    )
  )
    return "base_play";
  if (
    events.some((event) => event.kind === "pitch_commit") ||
    cues.some(
      (cue) =>
        cue.type === "pitch" ||
        (cue.type === "choice" &&
          (cue.actor === "pitcher" || cue.actor === "batter")),
    )
  )
    return "pitch_duel";
  return "generic";
}

function inferSceneCamera(
  template: PresentationSceneTemplate,
  cues: PresentationCue[],
): PresentationSceneCamera {
  if (template === "pitch_duel") return "catcher";
  if (template === "inning_change" || template === "game_end")
    return "scoreboard";
  if (
    template === "base_play" ||
    cues.some(
      (cue) =>
        cue.type === "throw" &&
        (cue.kind === "pickoff" || cue.kind === "caught_stealing"),
    )
  )
    return "base";
  return "field";
}

export function getAudioCues(events: GameEvent[]): AudioCue[] {
  const cues: AudioCue[] = [];
  for (const event of events) {
    if (
      event.kind === "pitch_result" ||
      (event.kind === "die_roll" && event.die === "pitch")
    )
      cues.push("pitch");
    if (
      (event.kind === "batted_ball" && isBattedFace(event.face)) ||
      (event.kind === "die_roll" && event.die === "batting")
    ) {
      cues.push(
        event.face === "GF" || event.face === "G3" || event.face === "GA"
          ? "ground"
          : "contact",
      );
    }
    if (event.kind === "die_roll" && event.die === "hit") cues.push("contact");
    if (event.face === "HR" || event.cardId === "HRC") cues.push("home_run");
    if (event.moves.some((move) => move.to === "out")) {
      const needsThrow =
        !event.summary.includes("타구에 맞은") &&
        event.moves.some((move) => move.to === "out" && Boolean(move.outAt));
      if (needsThrow) cues.push("throw");
      cues.push("out");
    }
    if (event.runs > 0) cues.push("score");
    if (event.kind === "count") {
      if (event.summary.startsWith("볼")) cues.push("mitt", "ball");
      else if (
        event.summary.includes("스트라이크") ||
        event.summary.includes("삼진")
      )
        cues.push("mitt", "strike");
      else if (event.summary.includes("파울")) cues.push("contact");
    }
  }
  return cues.filter((cue, index) => cue !== cues[index - 1]);
}

function pitchCall(
  face: PitchFace,
): Extract<PresentationCue, { type: "call" }>["call"] {
  if (face === "B") return "ball";
  if (face === "F") return "foul";
  if (face === "C") return "contact";
  return "strike";
}

function inferThrowKind(
  event: GameEvent,
): Extract<PresentationCue, { type: "throw" }>["kind"] {
  if (["PO1", "PO2", "CO1", "CO3", "POE"].includes(event.cardId ?? "")) {
    return "pickoff";
  }
  if (["CS2", "CS3", "CSH"].includes(event.cardId ?? "")) {
    return "caught_stealing";
  }
  return "throw";
}

function inferThrowStart(
  event: GameEvent,
  kind: Extract<PresentationCue, { type: "throw" }>["kind"],
  current: FieldPoint,
) {
  if (kind === "caught_stealing") return FIELD_POINTS.home;
  if (["PO1", "PO2", "POE"].includes(event.cardId ?? "")) {
    return FIELD_POINTS.out;
  }
  if (["CO1", "CO3"].includes(event.cardId ?? "")) return FIELD_POINTS.home;
  return current;
}

function inferRunnerAction(
  event: GameEvent,
  move: RunnerMove,
  battedFace: BattingFace | HitFace | null,
  throwKind: Extract<PresentationCue, { type: "throw" }>["kind"],
  resolutionCardId: CardId | null,
): Extract<PresentationCue, { type: "runner_move" }>["action"] {
  if (move.runner === "batter") return "batter_run";
  if (throwKind === "pickoff") return "pickoff_return";
  if (
    throwKind === "caught_stealing" ||
    ["SB2", "SB3", "SBH"].includes(event.cardId ?? "")
  ) {
    return "steal";
  }
  if (
    battedFace === "F2" ||
    battedFace === "F3" ||
    battedFace === "FA" ||
    event.cardId === "A3F" ||
    event.cardId === "AHF"
  ) {
    return "tag_up";
  }
  if (resolutionCardId === "LDP") return "pickoff_return";
  if (move.to === "home") return "score";
  if (move.to === "out") return "force_play";
  return "advance";
}

function inferOutDestination(event: GameEvent, move: RunnerMove): FieldPoint {
  if (move.outAt) return FIELD_POINTS[move.outAt];
  if (event.cardId === "PO1" || event.cardId === "CO1") {
    return FIELD_POINTS.first;
  }
  if (event.cardId === "PO2") return FIELD_POINTS.second;
  if (event.cardId === "CO3") return FIELD_POINTS.third;
  if (event.cardId === "CS2") return FIELD_POINTS.second;
  if (event.cardId === "CS3") return FIELD_POINTS.third;
  if (event.cardId === "CSH") return FIELD_POINTS.home;
  if (move.from === "batter") return FIELD_POINTS.first;
  if (move.from === "first") return FIELD_POINTS.second;
  if (move.from === "second") return FIELD_POINTS.third;
  return FIELD_POINTS.home;
}

function buildRunnerPath(
  move: RunnerMove,
  origin: FieldPoint,
  destination: FieldPoint,
  action: Extract<PresentationCue, { type: "runner_move" }>["action"],
) {
  if (action === "pickoff_return") {
    return curvedFieldPath(origin, destination, 10);
  }

  const target = move.to === "out" ? move.outAt : move.to;
  if (!target) return straightFieldPath(origin, destination);

  const start = move.from === "batter" ? "home" : move.from;
  const order = ["home", "first", "second", "third", "home"] as const;
  const startIndex = start === "home" ? 0 : order.indexOf(start);
  let targetIndex = order.indexOf(target, startIndex + 1);
  if (target === start && move.runner === "batter")
    targetIndex = order.length - 1;
  if (targetIndex < 0) return straightFieldPath(origin, destination);

  const points: FieldPoint[] = [origin];
  for (let index = startIndex + 1; index <= targetIndex; index += 1) {
    points.push(FIELD_POINTS[order[index]]);
  }
  if (points.length === 1) points.push(destination);
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
    .join(" ");
}

function buildThrowPath(from: FieldPoint, to: FieldPoint) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const lift = Math.min(54, Math.max(18, distance * 0.16));
  return curvedFieldPath(from, to, lift);
}

function curvedFieldPath(from: FieldPoint, to: FieldPoint, lift: number) {
  const midpointX = (from.x + to.x) / 2;
  const midpointY = (from.y + to.y) / 2 - lift;
  return `M${from.x} ${from.y} Q${midpointX} ${midpointY} ${to.x} ${to.y}`;
}

function straightFieldPath(from: FieldPoint, to: FieldPoint) {
  return `M${from.x} ${from.y} L${to.x} ${to.y}`;
}

function leadOffPoint(from: RunnerOrigin): FieldPoint {
  const base = FIELD_POINTS[from];
  const next =
    from === "first"
      ? FIELD_POINTS.second
      : from === "second"
        ? FIELD_POINTS.third
        : from === "third"
          ? FIELD_POINTS.home
          : FIELD_POINTS.first;
  return {
    x: base.x + (next.x - base.x) * 0.28,
    y: base.y + (next.y - base.y) * 0.28,
  };
}

function runnerMoveLabel(
  from: RunnerOrigin,
  destination: FieldPoint,
  isOutAttempt: boolean,
) {
  const fromLabel = from === "batter" ? "타자" : baseName(FIELD_POINTS[from]);
  const toLabel = baseName(destination);
  return isOutAttempt
    ? `${fromLabel}${from === "batter" ? "" : " 주자"} · ${toLabel} 승부`
    : `${fromLabel} → ${toLabel}`;
}

function runnerDestinationRank(destination: RunnerMove["to"]) {
  if (destination === "home") return 4;
  if (destination === "third") return 3;
  if (destination === "second") return 2;
  if (destination === "first") return 1;
  return 0;
}

function runnerOriginRank(origin: RunnerMove["from"]) {
  if (origin === "third") return 3;
  if (origin === "second") return 2;
  if (origin === "first") return 1;
  return 0;
}

function throwLabel(
  event: GameEvent,
  destination: FieldPoint,
  kind: Extract<PresentationCue, { type: "throw" }>["kind"],
) {
  if (kind === "pickoff") return `${baseName(destination)} 견제`;
  if (kind === "caught_stealing") return `${baseName(destination)} 도루 저지`;
  if (event.summary.includes("병살"))
    return `${baseName(destination)} 병살 송구`;
  return `${baseName(destination)} 송구`;
}

function baseName(point: FieldPoint) {
  if (point.x === FIELD_POINTS.first.x && point.y === FIELD_POINTS.first.y)
    return "1루";
  if (point.x === FIELD_POINTS.second.x && point.y === FIELD_POINTS.second.y)
    return "2루";
  if (point.x === FIELD_POINTS.third.x && point.y === FIELD_POINTS.third.y)
    return "3루";
  return "홈";
}

function isPitchFace(face: GameEvent["face"]): face is PitchFace {
  return (
    face === "S" ||
    face === "SM" ||
    face === "F" ||
    face === "B" ||
    face === "C"
  );
}

function isBattedFace(face: GameEvent["face"]): face is BattingFace | HitFace {
  return Boolean(face && face in CATCH_POINTS);
}

function battedBallVariation(
  event: GameEvent,
  pitchLocation: PitchLocation | null,
) {
  const pitchKey = pitchLocation
    ? Math.round(pitchLocation.x * 100) * 31 +
      Math.round(pitchLocation.y * 100) * 17
    : 0;
  const faceKey = event.face?.charCodeAt(0) ?? 0;
  const value = hash(
    event.sequence * 131 + event.revision * 977 + pitchKey + faceKey,
  );
  return ((value % 2_001) - 1_000) / 1_000;
}

function isCaughtFace(face: BattingFace | HitFace) {
  return (
    face === "PO" ||
    face === "FO" ||
    face === "F2" ||
    face === "F3" ||
    face === "FA"
  );
}

function battedBallLabel(face: BattingFace | HitFace) {
  if (face === "GF") return "땅볼";
  if (face === "G3" || face === "GA") return "진루타";
  if (face === "PO") return "내야 플라이";
  if (face === "FO" || face === "F2" || face === "F3" || face === "FA") {
    return "외야 플라이";
  }
  if (face === "HR") return "홈런 타구";
  if (face === "HIT") return "안타성 타구";
  if (face === "IH") return "내야 안타";
  if (face === "D2" || face === "D3") return "2루타";
  if (face === "T3") return "3루타";
  return "외야 안타";
}

function hash(value: number) {
  let next = value | 0;
  next = Math.imul(next ^ (next >>> 16), 0x45d9f3b);
  next = Math.imul(next ^ (next >>> 16), 0x45d9f3b);
  return (next ^ (next >>> 16)) >>> 0;
}

function dedupeAdjacent(cues: PresentationCue[]) {
  return cues.filter(
    (cue, index) => JSON.stringify(cue) !== JSON.stringify(cues[index - 1]),
  );
}
