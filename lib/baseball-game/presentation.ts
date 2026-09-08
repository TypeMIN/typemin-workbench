import type {
  AudioCue,
  BattingFace,
  FieldPoint,
  GameEvent,
  HitFace,
  PitchFace,
  PitchLocation,
  PresentationCue,
  RunnerDestination,
  RunnerOrigin,
} from "./types";

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
  event: Pick<GameEvent, "sequence" | "revision" | "face">,
  pitchNumber = 1,
): PitchLocation | null {
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
    if (side === 0)
      return {
        x: 8 + unitA * 14,
        y: 20 + unitB * 60,
        zone: "ball",
        pitchNumber,
      };
    if (side === 1)
      return {
        x: 78 + unitA * 14,
        y: 20 + unitB * 60,
        zone: "ball",
        pitchNumber,
      };
    if (side === 2)
      return {
        x: 20 + unitA * 60,
        y: 7 + unitB * 13,
        zone: "ball",
        pitchNumber,
      };
    return {
      x: 20 + unitA * 60,
      y: 80 + unitB * 13,
      zone: "ball",
      pitchNumber,
    };
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

export function getPlateAppearancePitchHistory(events: GameEvent[]) {
  const latestPlateAppearance = events.reduce(
    (last, event, index) => (event.kind === "plate_appearance" ? index : last),
    -1,
  );
  const pitchEvents = events
    .slice(latestPlateAppearance + 1)
    .filter((event) => event.kind === "die_roll" && event.die === "pitch");
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
    history.push({
      event,
      face: event.face,
      location: overlapCount
        ? {
            ...location,
            x: Math.max(3, Math.min(97, location.x + overlapCount * 3)),
            y: Math.max(3, Math.min(97, location.y + overlapCount * 2)),
          }
        : location,
    });
  });
  return history;
}

export function buildPresentationCues(events: GameEvent[]): PresentationCue[] {
  const cues: PresentationCue[] = [];
  const pitchEventsBefore = events.filter(
    (event) => event.kind === "die_roll" && event.die === "pitch",
  );

  events.forEach((event) => {
    if (
      event.kind === "die_roll" &&
      event.die === "pitch" &&
      isPitchFace(event.face)
    ) {
      const pitchNumber =
        pitchEventsBefore.findIndex(
          (pitch) => pitch.sequence === event.sequence,
        ) + 1;
      const location = getPitchLocation(event, pitchNumber);
      if (location) cues.push({ type: "pitch", location, face: event.face });
      cues.push({ type: "call", call: pitchCall(event.face) });
    }
    if (
      event.kind === "die_roll" &&
      (event.die === "batting" || event.die === "hit") &&
      isBattedFace(event.face)
    ) {
      cues.push({ type: "batted_ball", face: event.face });
      if (isCaughtFace(event.face))
        cues.push({ type: "catch", location: CATCH_POINTS[event.face] });
    }

    for (const move of event.moves) {
      if (move.to === "out") {
        cues.push({
          type: "throw",
          from: inferThrowOrigin(event.face),
          to: FIELD_POINTS[move.from],
        });
      } else {
        cues.push({ type: "runner_move", move });
      }
      cues.push({
        type: "decision",
        result:
          move.to === "out" ? "out" : move.to === "home" ? "score" : "safe",
      });
    }
  });

  return dedupeAdjacent(cues).slice(0, 16);
}

export function getAudioCues(events: GameEvent[]): AudioCue[] {
  const cues: AudioCue[] = [];
  for (const event of events) {
    if (event.kind === "die_roll" && event.die === "pitch") cues.push("pitch");
    if (event.kind === "die_roll" && event.die === "batting") {
      cues.push(
        event.face === "GF" || event.face === "G3" || event.face === "GA"
          ? "ground"
          : "contact",
      );
    }
    if (event.kind === "die_roll" && event.die === "hit") cues.push("contact");
    if (event.face === "HR" || event.cardId === "HRC") cues.push("home_run");
    if (event.moves.some((move) => move.to === "out"))
      cues.push("throw", "out");
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

function inferThrowOrigin(face: GameEvent["face"]): FieldPoint {
  return face && isBattedFace(face) ? CATCH_POINTS[face] : { x: 450, y: 560 };
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

function isCaughtFace(face: BattingFace | HitFace) {
  return (
    face === "PO" ||
    face === "FO" ||
    face === "F2" ||
    face === "F3" ||
    face === "FA"
  );
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
