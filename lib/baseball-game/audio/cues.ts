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
  | "your_turn";

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
};

export type BeatSounds = {
  sfx: SoundCue[];
  crowd: CrowdReaction | null;
};

const CARD_STINGS: Record<CardTier, SoundCue> = {
  basic: "card_basic",
  intermediate: "card_intermediate",
  advanced: "card_advanced",
};

const GROUND_FACES = new Set(["GF", "G3", "GA", "IH"]);
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
  const gameEnd = events.find((event) => event.kind === "game_end");
  return {
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
  const fielding: TeamSide = context.battingTeam === "away" ? "home" : "away";
  const cue = beat.cue;

  if (cue.type === "choice") {
    if (cue.concealed) sfx.push("lock");
    if (cue.actor === "offense" || cue.actor === "defense") {
      const tier = context.cardTiers[0];
      if (tier) sfx.push(CARD_STINGS[tier]);
    }
  } else if (cue.type === "pitch") {
    sfx.push("pitch");
  } else if (cue.type === "call") {
    if (cue.call === "contact") {
      sfx.push("bat_solid");
    } else if (cue.call === "foul") {
      sfx.push("bat_foul");
    } else {
      if (context.pitchFace === "SM") sfx.push("whiff");
      sfx.push("mitt");
    }
  } else if (cue.type === "batted_ball") {
    if (cue.face === "HR") {
      crowd = reactionFor(perspective, context.battingTeam, "roar", "roar");
    } else if (HIT_FACES.has(cue.face)) {
      if (GROUND_FACES.has(cue.face)) sfx.push("bounce");
      crowd = reactionFor(perspective, context.battingTeam, "cheer", "cheer");
    } else {
      if (GROUND_FACES.has(cue.face)) sfx.push("bounce");
      crowd = "rise";
    }
  } else if (cue.type === "catch") {
    sfx.push("catch");
  } else if (cue.type === "throw") {
    sfx.push("throw");
  } else if (cue.type === "runner_move") {
    if (cue.action === "steal") sfx.push("slide");
  } else if (cue.type === "decision") {
    if (cue.result === "out") {
      sfx.push("out");
      crowd = reactionFor(perspective, fielding, "cheer", "gasp");
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
  return { sfx, crowd };
}
