import type {
  BattingFace,
  DuelWinner,
  HitFace,
  PitchFace,
  PitchLocation,
  PitchTarget,
  SwingDecision,
} from "./types";

export type PitchTendency = {
  contact: number;
  foul: number;
  whiff: number;
  ground: number;
  air: number;
  hit: number;
  homeRun: number;
};

export const PITCH_TARGETS = [
  "strike",
  "ball",
] as const satisfies readonly PitchTarget[];

export const PITCH_TARGET_LABELS: Record<PitchTarget, string> = {
  strike: "스트라이크",
  ball: "볼",
};

export const PITCH_TENDENCIES: Record<PitchTarget, PitchTendency> = {
  strike: {
    contact: 82,
    foul: 12,
    whiff: 6,
    ground: 36,
    air: 34,
    hit: 24,
    homeRun: 6,
  },
  ball: {
    contact: 6,
    foul: 14,
    whiff: 80,
    ground: 45,
    air: 35,
    hit: 17,
    homeRun: 3,
  },
};

/** Winning the read should feel decisive without changing count rules. */
export const BATTER_DUEL_HIT_BONUS = 24;
export const PITCHER_DUEL_HIT_PENALTY = 18;

export function normalizePitchTarget(value: unknown): PitchTarget {
  return value === "ball" ? "ball" : "strike";
}

export function resolveDuelWinner(
  target: PitchTarget,
  decision: SwingDecision,
): DuelWinner {
  const isStrike = target === "strike";
  return (isStrike && decision === "swing") ||
    (!isStrike && decision === "take")
    ? "batter"
    : "pitcher";
}

export function getBattedBallTendency(
  target: PitchTarget,
  duelWinner: DuelWinner | null = null,
): Pick<PitchTendency, "ground" | "air" | "hit" | "homeRun"> {
  const tendency = PITCH_TENDENCIES[target];
  if (!duelWinner) {
    return {
      ground: tendency.ground,
      air: tendency.air,
      hit: tendency.hit,
      homeRun: tendency.homeRun,
    };
  }
  return duelWinner === "batter"
    ? {
        ground: tendency.ground - 12,
        air: tendency.air - 12,
        hit: tendency.hit + 17,
        homeRun: tendency.homeRun + 7,
      }
    : {
        ground: tendency.ground + 9,
        air: tendency.air + 9,
        hit: tendency.hit - 15,
        homeRun: tendency.homeRun - 3,
      };
}

const GROUND_OUTCOMES = [
  ["GF", 40],
  ["G3", 25],
  ["GA", 35],
] as const satisfies readonly (readonly [BattingFace, number])[];

const AIR_OUTCOMES = [
  ["PO", 18],
  ["FO", 28],
  ["F2", 18],
  ["F3", 18],
  ["FA", 18],
] as const satisfies readonly (readonly [BattingFace, number])[];

const HIT_OUTCOMES = [
  ["IH", 1],
  ["L1", 1],
  ["L2", 2],
  ["C1", 1],
  ["C2", 1],
  ["R1", 1],
  ["R2", 2],
  ["D2", 1],
  ["D3", 1],
  ["T3", 1],
] as const satisfies readonly (readonly [HitFace, number])[];

export function createActualPitchLocation(
  target: PitchTarget,
  pitchNumber: number,
  random: () => number,
): PitchLocation {
  const x = random();
  const y = random();
  if (target === "ball") {
    const side = Math.floor(random() * 4);
    if (side === 0)
      return { x: 8 + x * 15, y: 22 + y * 56, zone: "ball", pitchNumber };
    if (side === 1)
      return { x: 77 + x * 15, y: 22 + y * 56, zone: "ball", pitchNumber };
    if (side === 2)
      return { x: 22 + x * 56, y: 7 + y * 14, zone: "ball", pitchNumber };
    return { x: 22 + x * 56, y: 79 + y * 14, zone: "ball", pitchNumber };
  }

  return {
    x: 27 + x * 46,
    y: 23 + y * 54,
    zone: "strike",
    pitchNumber,
  };
}

export function resolvePitchFace(
  target: PitchTarget,
  decision: SwingDecision,
  random: () => number,
): PitchFace {
  if (decision === "take") return target === "ball" ? "B" : "S";
  const tendency = PITCH_TENDENCIES[target];
  const roll = random() * 100;
  if (roll < tendency.contact) return "C";
  if (roll < tendency.contact + tendency.foul) return "F";
  return "SM";
}

export function resolveBattedBall(
  target: PitchTarget,
  random: () => number,
  duelWinner: DuelWinner | null = null,
): BattingFace {
  const tendency = getBattedBallTendency(target, duelWinner);
  const roll = random() * 100;
  if (roll < tendency.ground) return weighted(GROUND_OUTCOMES, random());
  if (roll < tendency.ground + tendency.air)
    return weighted(AIR_OUTCOMES, random());
  if (roll < tendency.ground + tendency.air + tendency.hit) return "HIT";
  return "HR";
}

export function resolveHitOutcome(random: () => number): HitFace {
  return weighted(HIT_OUTCOMES, random());
}

function weighted<T extends string>(
  choices: readonly (readonly [T, number])[],
  value: number,
) {
  const total = choices.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = value * total;
  for (const [choice, weight] of choices) {
    if (cursor < weight) return choice;
    cursor -= weight;
  }
  return choices.at(-1)![0];
}
