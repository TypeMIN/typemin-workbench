import type { PlaceCandidate } from "@/lib/what-should-eat/types";

export type DuelState = {
  winner: PlaceCandidate;
  challenger: PlaceCandidate;
  remaining: PlaceCandidate[];
  round: number;
  totalRounds: number;
};

export function startDuel(
  candidates: readonly PlaceCandidate[],
): DuelState | null {
  if (candidates.length < 2) return null;
  const [winner, challenger, ...remaining] = candidates;
  return {
    winner,
    challenger,
    remaining,
    round: 1,
    totalRounds: candidates.length - 1,
  };
}

export function chooseDuel(
  state: DuelState,
  selected: PlaceCandidate,
): { state: DuelState | null; result: PlaceCandidate | null } {
  const [next, ...remaining] = state.remaining;
  if (!next) return { state: null, result: selected };

  return {
    result: null,
    state: {
      winner: selected,
      challenger: next,
      remaining,
      round: state.round + 1,
      totalRounds: state.totalRounds,
    },
  };
}
