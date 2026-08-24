import { categoryLevels } from "@/lib/what-should-eat/category";
import type { PlaceCandidate } from "@/lib/what-should-eat/types";

export const CANDIDATE_LIMIT = 8;

export function isMealCandidate(candidate: PlaceCandidate) {
  const levels = categoryLevels(candidate.category);
  return !levels.some((level) => level === "술집" || level === "간식");
}

export function shuffle<T>(items: readonly T[], random = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function selectCandidates(
  places: readonly PlaceCandidate[],
  recentlyVisitedPlaceIds: ReadonlySet<string>,
  limit = CANDIDATE_LIMIT,
  random = Math.random,
) {
  const mealPlaces = places.filter(isMealCandidate);
  const fresh = mealPlaces.filter(
    (place) => !recentlyVisitedPlaceIds.has(place.id),
  );
  const recent = mealPlaces.filter((place) =>
    recentlyVisitedPlaceIds.has(place.id),
  );

  if (fresh.length >= limit) return shuffle(fresh, random).slice(0, limit);

  return [
    ...shuffle(fresh, random),
    ...shuffle(recent, random).slice(0, Math.max(0, limit - fresh.length)),
  ];
}
