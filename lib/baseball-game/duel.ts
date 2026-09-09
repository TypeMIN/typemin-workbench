import type {
  BattingFace,
  HitFace,
  PitchFace,
  PitchHint,
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
  "high_inside",
  "high_outside",
  "low_inside",
  "low_outside",
  "ball",
] as const satisfies readonly PitchTarget[];

export const PITCH_TARGET_LABELS: Record<PitchTarget, string> = {
  high_inside: "높은 몸쪽",
  high_outside: "높은 바깥쪽",
  low_inside: "낮은 몸쪽",
  low_outside: "낮은 바깥쪽",
  ball: "볼",
};

export const PITCH_TENDENCIES: Record<PitchTarget, PitchTendency> = {
  high_inside: {
    contact: 68,
    foul: 17,
    whiff: 15,
    ground: 20,
    air: 55,
    hit: 17,
    homeRun: 8,
  },
  high_outside: {
    contact: 60,
    foul: 22,
    whiff: 18,
    ground: 22,
    air: 60,
    hit: 15,
    homeRun: 3,
  },
  low_inside: {
    contact: 64,
    foul: 18,
    whiff: 18,
    ground: 45,
    air: 23,
    hit: 27,
    homeRun: 5,
  },
  low_outside: {
    contact: 55,
    foul: 22,
    whiff: 23,
    ground: 52,
    air: 28,
    hit: 18,
    homeRun: 2,
  },
  ball: {
    contact: 12,
    foul: 18,
    whiff: 70,
    ground: 66,
    air: 27,
    hit: 7,
    homeRun: 0,
  },
};

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

  const inside = target.endsWith("inside");
  const high = target.startsWith("high");
  return {
    x: (inside ? 29 : 51) + x * 20,
    y: (high ? 25 : 51) + y * 24,
    zone: "strike",
    pitchNumber,
  };
}

export function createPitchHint(
  target: PitchTarget,
  actual: PitchLocation,
  random: () => number,
): PitchHint {
  const reliability = random();
  const jitterX = (random() - 0.5) * 10;
  const jitterY = (random() - 0.5) * 10;
  if (reliability < 0.68) {
    return {
      x: clamp(actual.x + jitterX, 5, 95),
      y: clamp(actual.y + jitterY, 5, 95),
      radius: 17,
      read: target === "ball" ? "likely_ball" : "likely_strike",
    };
  }
  if (reliability < 0.9) {
    return {
      x: clamp(actual.x + (actual.x < 50 ? 12 : -12) + jitterX, 12, 88),
      y: clamp(actual.y + (actual.y < 50 ? 10 : -10) + jitterY, 12, 88),
      radius: 22,
      read: "borderline",
    };
  }
  if (target === "ball") {
    return {
      x: 36 + random() * 28,
      y: 34 + random() * 32,
      radius: 24,
      read: "likely_strike",
    };
  }
  const left = random() < 0.5;
  return {
    x: left ? 12 + random() * 10 : 78 + random() * 10,
    y: 25 + random() * 50,
    radius: 24,
    read: "likely_ball",
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
): BattingFace {
  const tendency = PITCH_TENDENCIES[target];
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
