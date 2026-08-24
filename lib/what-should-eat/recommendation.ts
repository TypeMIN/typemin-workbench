import { categoryLevels } from "@/lib/what-should-eat/category";
import type {
  AppUser,
  PlaceCandidate,
  PreferenceResponse,
} from "@/lib/what-should-eat/types";
import { isMealCandidate } from "@/lib/what-should-eat/candidates";

type Participant = Pick<AppUser, "id" | "birthYear" | "gender">;

export type FeedbackSignal = {
  userId: number;
  placeId: string;
  category: string;
  response: PreferenceResponse;
  updatedAt: string;
};

export type ComparisonSignal = {
  hostUserId: number;
  winnerCategory: string;
  loserCategory: string;
};

export type RecommendationContext = {
  participants: Participant[];
  population: Participant[];
  feedback: FeedbackSignal[];
  comparisons: ComparisonSignal[];
  recentPlaceIds: ReadonlySet<string>;
  visitedPlaceIds: ReadonlySet<string>;
  recentCategoryCounts: ReadonlyMap<string, number>;
};

type RankedCandidate = {
  place: PlaceCandidate;
  category: string;
  score: number;
  newPlace: boolean;
  rediscovery: boolean;
};

const CATEGORY_DISLIKE_THRESHOLD = 2;
const DEFAULT_SCORE = 0;

export function getMajorCategory(category: string) {
  const levels = categoryLevels(category);
  const restaurantIndex = levels.indexOf("음식점");
  if (restaurantIndex >= 0) return levels[restaurantIndex + 1] || "기타";
  return levels[1] || levels[0] || "기타";
}

function responseValue(response: PreferenceResponse) {
  if (response === "liked") return 1;
  if (response === "disliked") return -1;
  return 0;
}

function latestFeedbackByUserAndPlace(feedback: readonly FeedbackSignal[]) {
  const latest = new Map<string, FeedbackSignal>();
  for (const item of feedback) {
    if (item.response === "not_visited") continue;
    const key = `${item.userId}:${item.placeId}`;
    const previous = latest.get(key);
    if (!previous || previous.updatedAt < item.updatedAt) latest.set(key, item);
  }
  return [...latest.values()];
}

function buildCategoryVectors(feedback: readonly FeedbackSignal[]) {
  const totals = new Map<
    number,
    Map<string, { total: number; count: number }>
  >();
  for (const item of feedback) {
    if (item.response === "not_visited") continue;
    const category = getMajorCategory(item.category);
    const user = totals.get(item.userId) ?? new Map();
    const current = user.get(category) ?? { total: 0, count: 0 };
    current.total += responseValue(item.response);
    current.count += 1;
    user.set(category, current);
    totals.set(item.userId, user);
  }

  return new Map(
    [...totals].map(([userId, categories]) => [
      userId,
      new Map(
        [...categories].map(([category, value]) => [
          category,
          value.total / value.count,
        ]),
      ),
    ]),
  );
}

function cosineSimilarity(
  left: ReadonlyMap<string, number>,
  right: ReadonlyMap<string, number>,
) {
  const overlap = [...left.keys()].filter((category) => right.has(category));
  if (overlap.length < 2) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (const category of overlap) {
    const leftValue = left.get(category) ?? 0;
    const rightValue = right.get(category) ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue ** 2;
    rightNorm += rightValue ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

function ageBand(birthYear: number) {
  const age = new Date().getFullYear() - birthYear;
  return Math.max(0, Math.floor(age / 10) * 10);
}

function average(values: readonly number[]) {
  return values.length === 0
    ? DEFAULT_SCORE
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function predictedPreference(
  user: Participant,
  place: PlaceCandidate,
  latestFeedback: readonly FeedbackSignal[],
  vectors: ReadonlyMap<number, ReadonlyMap<string, number>>,
  context: RecommendationContext,
) {
  const category = getMajorCategory(place.category);
  const userFeedback = latestFeedback.filter((item) => item.userId === user.id);
  const direct = userFeedback.find((item) => item.placeId === place.id);
  const categoryValues = userFeedback
    .filter((item) => getMajorCategory(item.category) === category)
    .map((item) => responseValue(item.response));
  const comparisonValues = context.comparisons
    .filter((item) => item.hostUserId === user.id)
    .flatMap((item) => {
      const values: number[] = [];
      if (getMajorCategory(item.winnerCategory) === category) values.push(0.35);
      if (getMajorCategory(item.loserCategory) === category) values.push(-0.15);
      return values;
    });

  const signals: Array<{ value: number; weight: number }> = [];
  if (direct)
    signals.push({ value: responseValue(direct.response), weight: 5 });
  if (categoryValues.length > 0) {
    signals.push({
      value: average(categoryValues),
      weight: Math.min(3, categoryValues.length),
    });
  }
  if (comparisonValues.length > 0) {
    signals.push({
      value: average(comparisonValues),
      weight: Math.min(1.5, comparisonValues.length * 0.15),
    });
  }

  const personalEvidence =
    userFeedback.length + Math.min(4, comparisonValues.length / 4);
  const userVector = vectors.get(user.id);
  if (userVector && userVector.size >= 2 && personalEvidence < 8) {
    const neighbors = [...vectors]
      .filter(
        ([otherUserId, vector]) =>
          otherUserId !== user.id && vector.has(category),
      )
      .map(([otherUserId, vector]) => ({
        similarity: cosineSimilarity(userVector, vector),
        value: vector.get(category) ?? 0,
        otherUserId,
      }))
      .filter((neighbor) => neighbor.similarity > 0)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, 5);
    if (neighbors.length > 0) {
      const totalSimilarity = neighbors.reduce(
        (sum, neighbor) => sum + neighbor.similarity,
        0,
      );
      const neighborValue =
        neighbors.reduce(
          (sum, neighbor) => sum + neighbor.value * neighbor.similarity,
          0,
        ) / totalSimilarity;
      signals.push({
        value: neighborValue,
        weight: Math.max(0.2, 1.2 - personalEvidence * 0.15),
      });
    }
  }

  if (personalEvidence < 5) {
    const populationById = new Map(
      context.population.map((member) => [member.id, member]),
    );
    const demographicValues = latestFeedback
      .filter((item) => {
        const member = populationById.get(item.userId);
        return (
          member &&
          item.userId !== user.id &&
          member.gender === user.gender &&
          ageBand(member.birthYear) === ageBand(user.birthYear) &&
          getMajorCategory(item.category) === category
        );
      })
      .map((item) => responseValue(item.response));
    if (demographicValues.length >= 3) {
      signals.push({
        value: average(demographicValues),
        weight: Math.max(0.2, 0.8 - personalEvidence * 0.15),
      });
    }

    const globalValues = latestFeedback
      .filter((item) => getMajorCategory(item.category) === category)
      .map((item) => responseValue(item.response));
    if (globalValues.length >= 2) {
      signals.push({
        value: average(globalValues),
        weight: Math.max(0.1, 0.45 - personalEvidence * 0.08),
      });
    }
  }

  if (signals.length === 0) return DEFAULT_SCORE;
  const totalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0);
  return (
    signals.reduce((sum, signal) => sum + signal.value * signal.weight, 0) /
    totalWeight
  );
}

function isStronglyDisliked(
  place: PlaceCandidate,
  participants: readonly Participant[],
  latestFeedback: readonly FeedbackSignal[],
) {
  const participantIds = new Set(
    participants.map((participant) => participant.id),
  );
  const relevant = latestFeedback.filter((item) =>
    participantIds.has(item.userId),
  );
  if (
    relevant.some(
      (item) => item.placeId === place.id && item.response === "disliked",
    )
  )
    return true;

  const category = getMajorCategory(place.category);
  return participants.some((participant) => {
    const dislikedPlaces = new Set(
      relevant
        .filter(
          (item) =>
            item.userId === participant.id &&
            item.response === "disliked" &&
            getMajorCategory(item.category) === category,
        )
        .map((item) => item.placeId),
    );
    return dislikedPlaces.size >= CATEGORY_DISLIKE_THRESHOLD;
  });
}

function addCandidates(
  selected: RankedCandidate[],
  pool: readonly RankedCandidate[],
  count: number,
  categoryCap: number,
) {
  const selectedIds = new Set(selected.map((candidate) => candidate.place.id));
  const categoryCounts = new Map<string, number>();
  for (const candidate of selected) {
    categoryCounts.set(
      candidate.category,
      (categoryCounts.get(candidate.category) ?? 0) + 1,
    );
  }

  let added = 0;
  for (const candidate of pool) {
    if (added >= count) break;
    if (selectedIds.has(candidate.place.id)) continue;
    if ((categoryCounts.get(candidate.category) ?? 0) >= categoryCap) continue;
    selected.push(candidate);
    selectedIds.add(candidate.place.id);
    categoryCounts.set(
      candidate.category,
      (categoryCounts.get(candidate.category) ?? 0) + 1,
    );
    added += 1;
  }
}

export function selectRecommendedCandidates(
  places: readonly PlaceCandidate[],
  context: RecommendationContext,
  limit = 8,
  random = Math.random,
) {
  const latestFeedback = latestFeedbackByUserAndPlace(context.feedback);
  const vectors = buildCategoryVectors(latestFeedback);
  const participantIds = new Set(
    context.participants.map((participant) => participant.id),
  );
  const participantFeedback = latestFeedback.filter((item) =>
    participantIds.has(item.userId),
  );

  const ranked: RankedCandidate[] = places
    .filter(isMealCandidate)
    .filter(
      (place) =>
        !isStronglyDisliked(place, context.participants, latestFeedback),
    )
    .map((place) => {
      const category = getMajorCategory(place.category);
      const groupPreference = average(
        context.participants.map((participant) =>
          predictedPreference(
            participant,
            place,
            latestFeedback,
            vectors,
            context,
          ),
        ),
      );
      const recent = context.recentPlaceIds.has(place.id);
      const distanceBonus = Math.max(0, 1 - place.distanceMeters / 1000) * 0.05;
      return {
        place,
        category,
        score:
          groupPreference + distanceBonus + random() * 0.02 - (recent ? 2 : 0),
        newPlace:
          !context.visitedPlaceIds.has(place.id) &&
          !participantFeedback.some((item) => item.placeId === place.id),
        rediscovery:
          !recent &&
          participantFeedback.some(
            (item) => item.placeId === place.id && item.response === "liked",
          ),
      };
    })
    .sort((left, right) => right.score - left.score);

  const selected: RankedCandidate[] = [];
  const fresh = ranked.filter(
    (candidate) => !context.recentPlaceIds.has(candidate.place.id),
  );
  const rediscoveries = fresh.filter((candidate) => candidate.rediscovery);
  const newPlaces = fresh.filter((candidate) => candidate.newPlace);
  const variety = [...fresh].sort((left, right) => {
    const frequencyDifference =
      (context.recentCategoryCounts.get(left.category) ?? 0) -
      (context.recentCategoryCounts.get(right.category) ?? 0);
    return frequencyDifference || right.score - left.score;
  });

  addCandidates(selected, rediscoveries, 1, 2);
  addCandidates(selected, variety, 1, 2);
  addCandidates(selected, newPlaces, 2, 2);
  addCandidates(selected, fresh, 4, 2);
  addCandidates(selected, fresh, limit - selected.length, 2);
  addCandidates(selected, ranked, limit - selected.length, 2);

  for (
    let categoryCap = 3;
    selected.length < limit && categoryCap <= limit;
    categoryCap += 1
  ) {
    addCandidates(selected, ranked, limit - selected.length, categoryCap);
  }

  return selected.slice(0, limit).map((candidate) => candidate.place);
}
