import type { TeamSide } from "../types";

export const REACTION_KINDS = [
  "clap",
  "nice",
  "close",
  "taunt",
  "calm",
  "gg",
] as const;

export type ReactionKind = (typeof REACTION_KINDS)[number];

export const REACTION_LABELS: Record<ReactionKind, string> = {
  clap: "박수",
  nice: "나이스 플레이",
  close: "아깝다",
  taunt: "한 번 더 와봐",
  calm: "침착하게",
  gg: "GG",
};

// One reaction per play beat keeps the stage readable and blocks spam.
export const REACTION_COOLDOWN_MS = 2_500;
// Long enough for a 250–2,500ms polling device to receive it once.
export const REACTION_VISIBLE_MS = 8_000;
export const REACTION_HISTORY_LIMIT = 12;

export type MultiplayerReaction = {
  id: string;
  team: TeamSide;
  kind: ReactionKind;
  at: string;
};

export function parseReactionKind(value: unknown): ReactionKind | null {
  return REACTION_KINDS.includes(value as ReactionKind)
    ? (value as ReactionKind)
    : null;
}

export function visibleReactions(
  reactions: MultiplayerReaction[],
  now: number,
): MultiplayerReaction[] {
  return reactions.filter((reaction) => {
    const at = Date.parse(reaction.at);
    return Number.isFinite(at) && now - at <= REACTION_VISIBLE_MS;
  });
}
