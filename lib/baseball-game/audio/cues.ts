import { CARD_DEFINITIONS } from "../cards";
import type {
  CardTier,
  GameEvent,
  PitchFace,
  PresentationBeat,
  PresentationScene,
  TeamSide,
} from "../types";

export type SoundCue =
  | "pitch"
  | "mitt"
  | "bat_solid"
  | "bat_foul"
  | "whiff"
  | "bounce"
  | "catch"
  | "throw"
  | "slide"
  | "out"
  | "score"
  | "lock"
  | "card_basic"
  | "card_intermediate"
  | "card_advanced"
  | "organ_inning"
  | "walk_off"
  | "game_end"
  | "tick"
  | "tick_final"
  | "timeout_call"
  | "reaction"
  | "your_turn"
  | "bat_crush"
  | "bat_dull"
  | "bat_pop"
  | "catch_far"
  | "fence"
  | "strikeout"
  | "ump_play"
  | "ump_strike"
  | "ump_ball"
  | "ump_out"
  | "ump_safe"
  | "ump_strikeout";

/** What the plate umpire (or the PA voice for a home run) calls out. */
export type UmpireCall =
  | "play_ball"
  | "strike"
  | "strikeout"
  | "ball"
  | "walk"
  | "hit_by_pitch"
  | "foul"
  | "out"
  | "safe"
  | "home_run"
  | "game_set";

export type CrowdReaction = "rise" | "cheer" | "roar" | "groan" | "gasp";

/** Whose fans the local crowd is. `neutral` is a shared venue screen. */
export type SoundPerspective = TeamSide | "neutral";

export type SceneAudioContext = {
  battingTeam: TeamSide;
  pitchFace: PitchFace | null;
  cardTiers: CardTier[];
  template: PresentationScene["template"];
  lastBeatId: string | null;
  walkOff: boolean;
  battedFace: string | null;
  walk: boolean;
  hitByPitch: boolean;
  strikeout: boolean;
  firstPitchOfGame: boolean;
};

export type BeatSounds = {
  sfx: SoundCue[];
  crowd: CrowdReaction | null;
  call: UmpireCall | null;
};

const CARD_STINGS: Record<CardTier, SoundCue> = {
  basic: "card_basic",
  intermediate: "card_intermediate",
  advanced: "card_advanced",
};

const GROUND_FACES = new Set(["GF", "G3", "GA", "IH"]);
const EXTRA_BASE_FACES = new Set(["D2", "D3", "T3"]);
const OUTFIELD_FLY_FACES = new Set(["FO", "F2", "F3", "FA"]);
const HIT_FACES = new Set([
  "HIT",
  "IH",
  "L1",
  "L2",
  "C1",
  "C2",
  "R1",
  "R2",
  "D2",
  "D3",
  "T3",
]);

export function getSceneAudioContext(
  scene: PresentationScene,
  eventLog: GameEvent[],
): SceneAudioContext {
  const events = eventLog.filter((event) => event.revision === scene.revision);
  const half = events[0]?.half ?? "top";
  const pitch = scene.beats.find((beat) => beat.cue.type === "pitch")?.cue;
  const batted = scene.beats.find(
    (beat) => beat.cue.type === "batted_ball",
  )?.cue;
  const gameEnd = events.find((event) => event.kind === "game_end");
  const summaries = events.map((event) => event.summary).join(" ");
  const firstPitchIndex = eventLog.findIndex(
    (event) => event.kind === "pitch_result",
  );
  return {
    battedFace: batted?.type === "batted_ball" ? batted.face : null,
    walk: summaries.includes("볼넷"),
    hitByPitch: summaries.includes("몸에 맞는 공"),
    strikeout: summaries.includes("삼진"),
    firstPitchOfGame:
      firstPitchIndex >= 0 &&
      eventLog[firstPitchIndex].revision === scene.revision,
    battingTeam: half === "top" ? "away" : "home",
    pitchFace: pitch?.type === "pitch" ? pitch.face : null,
    cardTiers: events
      .filter((event) => event.kind === "card_play" && event.cardId)
      .map((event) => CARD_DEFINITIONS[event.cardId!].tier),
    template: scene.template,
    lastBeatId: scene.beats.at(-1)?.id ?? null,
    walkOff: Boolean(
      gameEnd && half === "bottom" && events.some((event) => event.runs > 0),
    ),
  };
}

function reactionFor(
  perspective: SoundPerspective,
  beneficiary: TeamSide,
  good: CrowdReaction,
  neutral: CrowdReaction | null,
): CrowdReaction | null {
  if (perspective === "neutral") return neutral;
  return perspective === beneficiary ? good : "groan";
}

export function getBeatSounds(
  beat: PresentationBeat,
  context: SceneAudioContext,
  perspective: SoundPerspective,
): BeatSounds {
  const sfx: SoundCue[] = [];
  let crowd: CrowdReaction | null = null;
  let call: UmpireCall | null = null;
  const fielding: TeamSide = context.battingTeam === "away" ? "home" : "away";
  const cue = beat.cue;

  if (cue.type === "choice") {
    if (cue.concealed) sfx.push("lock");
    if (cue.actor === "offense" || cue.actor === "defense") {
      const tier = context.cardTiers[0];
      if (tier) sfx.push(CARD_STINGS[tier]);
    }
  } else if (cue.type === "pitch") {
    if (context.firstPitchOfGame) call = "play_ball";
    sfx.push("pitch");
  } else if (cue.type === "call") {
    if (cue.call === "contact") {
      sfx.push(contactSound(context.battedFace));
    } else if (cue.call === "foul") {
      sfx.push("bat_foul");
      call = "foul";
    } else if (cue.call === "ball") {
      sfx.push("mitt");
      call = context.hitByPitch
        ? "hit_by_pitch"
        : context.walk
          ? "walk"
          : "ball";
    } else {
      if (context.pitchFace === "SM") sfx.push("whiff");
      sfx.push("mitt");
      // The strikeout decision beat right after makes the bigger call.
      call = context.strikeout ? null : "strike";
    }
  } else if (cue.type === "batted_ball") {
    if (cue.face === "HR") {
      call = "home_run";
      crowd = reactionFor(perspective, context.battingTeam, "roar", "roar");
    } else if (HIT_FACES.has(cue.face)) {
      if (GROUND_FACES.has(cue.face)) sfx.push("bounce");
      if (EXTRA_BASE_FACES.has(cue.face)) sfx.push("fence");
      crowd = reactionFor(perspective, context.battingTeam, "cheer", "cheer");
    } else {
      if (GROUND_FACES.has(cue.face)) sfx.push("bounce");
      crowd = "rise";
    }
  } else if (cue.type === "catch") {
    sfx.push(
      context.battedFace && OUTFIELD_FLY_FACES.has(context.battedFace)
        ? "catch_far"
        : "catch",
    );
  } else if (cue.type === "throw") {
    sfx.push("throw");
  } else if (cue.type === "runner_move") {
    if (cue.action === "steal") sfx.push("slide");
  } else if (cue.type === "decision") {
    if (cue.result === "out") {
      const strikeout = cue.camera === "catcher" && context.strikeout;
      sfx.push(strikeout ? "strikeout" : "out");
      call = strikeout ? "strikeout" : "out";
      crowd = reactionFor(perspective, fielding, "cheer", "gasp");
    } else if (cue.result === "safe") {
      call = "safe";
    } else if (cue.result === "score") {
      sfx.push("score");
      crowd = reactionFor(perspective, context.battingTeam, "roar", "cheer");
    }
  }

  if (beat.id === context.lastBeatId) {
    if (context.template === "inning_change") sfx.push("organ_inning");
    if (context.template === "game_end") {
      sfx.push(context.walkOff ? "walk_off" : "game_end");
    }
  }
  if (cue.type === "interlude" && cue.kind === "game_over") call = "game_set";
  return { sfx, crowd, call };
}

function contactSound(face: string | null): SoundCue {
  if (face === "HR") return "bat_crush";
  if (face && EXTRA_BASE_FACES.has(face)) return "bat_crush";
  if (face && GROUND_FACES.has(face)) return "bat_dull";
  if (face === "PO") return "bat_pop";
  return "bat_solid";
}
