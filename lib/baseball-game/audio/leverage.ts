import type { GameView } from "../types";

type LeverageInput = Pick<
  GameView,
  | "inning"
  | "half"
  | "outs"
  | "balls"
  | "strikes"
  | "bases"
  | "score"
  | "config"
  | "phase"
>;

// Tuning weights for the shared tension value. The maximum contributions add
// up to just over 1 so only a stacked late-game jam reaches full tension.
export const LEVERAGE_WEIGHTS = {
  base: 0.1,
  lateClose: 0.35,
  scoringPosition: 0.15,
  basesLoaded: 0.1,
  twoOutsWithRunners: 0.1,
  fullCount: 0.1,
  walkOffChance: 0.2,
} as const;

/** Score margin → how much a late inning still matters, from tie to blowout. */
const CLOSENESS_BY_MARGIN = [1, 0.85, 0.6, 0.3, 0.3] as const;
const BLOWOUT_CLOSENESS = 0.1;

export const CLUTCH_LEVERAGE = 0.6;

export function getLeverage(view: LeverageInput): number {
  if (view.phase === "finished") return 0;
  const innings = view.config.innings;
  const late = Math.min(1, Math.max(0, (view.inning - 1) / (innings - 1)));
  const margin = Math.abs(view.score.away - view.score.home);
  const closeness = CLOSENESS_BY_MARGIN[margin] ?? BLOWOUT_CLOSENESS;
  const { first, second, third } = view.bases;
  const runners = Number(first) + Number(second) + Number(third);

  let leverage =
    LEVERAGE_WEIGHTS.base + LEVERAGE_WEIGHTS.lateClose * late * closeness;
  if (second || third) leverage += LEVERAGE_WEIGHTS.scoringPosition;
  if (runners === 3) leverage += LEVERAGE_WEIGHTS.basesLoaded;
  if (view.outs === 2 && runners > 0) {
    leverage += LEVERAGE_WEIGHTS.twoOutsWithRunners;
  }
  if (view.balls === 3 && view.strikes === 2) {
    leverage += LEVERAGE_WEIGHTS.fullCount;
  }
  const deficit = view.score.away - view.score.home;
  if (
    view.half === "bottom" &&
    view.inning >= innings &&
    deficit >= 0 &&
    deficit <= runners
  ) {
    leverage += LEVERAGE_WEIGHTS.walkOffChance;
  }
  return Math.min(1, leverage);
}

export function isClutch(view: LeverageInput) {
  return getLeverage(view) >= CLUTCH_LEVERAGE;
}
