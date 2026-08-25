import { categoryLevels } from "@/lib/what-should-eat/category";
import { isMealCandidate } from "@/lib/what-should-eat/candidates";
import type {
  AppUser,
  PlaceCandidate,
  PreferenceResponse,
} from "@/lib/what-should-eat/types";

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
  accuracyRanks: ReadonlyMap<string, number>;
};

type CategoryPath = {
  major: string;
  middleKey: string | null;
  smallKey: string | null;
  detailKey: string | null;
};

type RankedCandidate = {
  place: PlaceCandidate;
  majorCategory: string;
  detailCategory: string | null;
  score: number;
  accuracyRank: number;
  newPlace: boolean;
  rediscovery: boolean;
};

type CategoryCaps = {
  major: number;
  detail: number;
};

const CATEGORY_DISLIKE_THRESHOLD = 3;
const DEFAULT_SCORE = 0;
const CAP_STAGES: readonly CategoryCaps[] = [
  { major: 3, detail: 2 },
  { major: 4, detail: 3 },
  { major: 5, detail: 4 },
  { major: Number.POSITIVE_INFINITY, detail: Number.POSITIVE_INFINITY },
];

function categoryPath(category: string): CategoryPath {
  const levels = categoryLevels(category);
  const restaurantIndex = levels.indexOf("음식점");
  const meaningful =
    restaurantIndex >= 0 ? levels.slice(restaurantIndex + 1) : levels;
  const major = meaningful[0] || "기타";
  const middle = meaningful[1] || null;
  const small = meaningful[2] || null;
  const middleKey = middle ? `${major} > ${middle}` : null;
  const smallKey = small ? `${major} > ${middle} > ${small}` : null;

  return {
    major,
    middleKey,
    smallKey,
    detailKey: smallKey ?? middleKey,
  };
}

export function getMajorCategory(category: string) {
  return categoryPath(category).major;
}

function responseValue(response: PreferenceResponse) {
  if (response === "liked") return 1;
  if (response === "disliked") return -1;
  return 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function average(values: readonly number[]) {
  return values.length === 0
    ? DEFAULT_SCORE
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weightedAverage(values: readonly { value: number; weight: number }[]) {
  if (values.length === 0) return DEFAULT_SCORE;
  const totalWeight = values.reduce((sum, value) => sum + value.weight, 0);
  return (
    values.reduce((sum, value) => sum + value.value * value.weight, 0) /
    totalWeight
  );
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

function feedbackAverageForCategory(
  feedback: readonly FeedbackSignal[],
  placeId: string,
  categoryKey: string | null,
  selectKey: (path: CategoryPath) => string | null,
) {
  if (!categoryKey) return DEFAULT_SCORE;
  return average(
    feedback
      .filter(
        (item) =>
          item.placeId !== placeId &&
          selectKey(categoryPath(item.category)) === categoryKey,
      )
      .map((item) => responseValue(item.response)),
  );
}

function comparisonAverageForCategory(
  comparisons: readonly ComparisonSignal[],
  categoryKey: string | null,
  selectKey: (path: CategoryPath) => string | null,
) {
  if (!categoryKey) return DEFAULT_SCORE;
  const values: number[] = [];
  for (const comparison of comparisons) {
    if (selectKey(categoryPath(comparison.winnerCategory)) === categoryKey) {
      values.push(1);
    }
    if (selectKey(categoryPath(comparison.loserCategory)) === categoryKey) {
      values.push(-1);
    }
  }
  return average(values);
}

function similarUserScore(
  user: Participant,
  category: string,
  vectors: ReadonlyMap<number, ReadonlyMap<string, number>>,
  personalEvidence: number,
) {
  const userVector = vectors.get(user.id);
  if (!userVector || userVector.size < 2 || personalEvidence >= 8) return 0;

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
  if (neighbors.length === 0) return 0;

  const totalSimilarity = neighbors.reduce(
    (sum, neighbor) => sum + neighbor.similarity,
    0,
  );
  const neighborValue =
    neighbors.reduce(
      (sum, neighbor) => sum + neighbor.value * neighbor.similarity,
      0,
    ) / totalSimilarity;
  const evidenceFactor = Math.max(0.2, 1 - personalEvidence / 8);
  return clamp(neighborValue, -1, 1) * 0.15 * evidenceFactor;
}

function coldStartScore(
  user: Participant,
  category: string,
  latestFeedback: readonly FeedbackSignal[],
  context: RecommendationContext,
  personalEvidence: number,
) {
  if (personalEvidence >= 5) return 0;
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
  const globalValues = latestFeedback
    .filter(
      (item) =>
        item.userId !== user.id && getMajorCategory(item.category) === category,
    )
    .map((item) => responseValue(item.response));
  const signals: Array<{ value: number; weight: number }> = [];

  if (demographicValues.length >= 3) {
    signals.push({ value: average(demographicValues), weight: 0.65 });
  }
  if (globalValues.length >= 2) {
    signals.push({ value: average(globalValues), weight: 0.35 });
  }
  if (signals.length === 0) return 0;

  const evidenceFactor = Math.max(0.2, 1 - personalEvidence / 5);
  return clamp(weightedAverage(signals), -1, 1) * 0.05 * evidenceFactor;
}

function predictedPreference(
  user: Participant,
  place: PlaceCandidate,
  latestFeedback: readonly FeedbackSignal[],
  vectors: ReadonlyMap<number, ReadonlyMap<string, number>>,
  context: RecommendationContext,
) {
  const placeCategory = categoryPath(place.category);
  const userFeedback = latestFeedback.filter((item) => item.userId === user.id);
  const direct = userFeedback.find((item) => item.placeId === place.id);
  const comparisons = context.comparisons.filter(
    (item) => item.hostUserId === user.id,
  );
  const exactScore = direct?.response === "liked" ? 1 : 0;
  const categoryScore =
    feedbackAverageForCategory(
      userFeedback,
      place.id,
      placeCategory.smallKey,
      (path) => path.smallKey,
    ) *
      0.6 +
    feedbackAverageForCategory(
      userFeedback,
      place.id,
      placeCategory.middleKey,
      (path) => path.middleKey,
    ) *
      0.25 +
    feedbackAverageForCategory(
      userFeedback,
      place.id,
      placeCategory.major,
      (path) => path.major,
    ) *
      0.1;
  const comparisonScore =
    clamp(
      comparisonAverageForCategory(
        comparisons,
        placeCategory.smallKey,
        (path) => path.smallKey,
      ) *
        0.6 +
        comparisonAverageForCategory(
          comparisons,
          placeCategory.middleKey,
          (path) => path.middleKey,
        ) *
          0.3 +
        comparisonAverageForCategory(
          comparisons,
          placeCategory.major,
          (path) => path.major,
        ) *
          0.1,
      -1,
      1,
    ) * 0.3;
  const personalEvidence =
    userFeedback.length + Math.min(4, comparisons.length / 4);

  return (
    exactScore +
    categoryScore +
    comparisonScore +
    similarUserScore(user, placeCategory.major, vectors, personalEvidence) +
    coldStartScore(
      user,
      placeCategory.major,
      latestFeedback,
      context,
      personalEvidence,
    )
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
  ) {
    return true;
  }

  const detailCategory = categoryPath(place.category).detailKey;
  if (!detailCategory) return false;

  return participants.some((participant) => {
    const dislikedPlaces = new Set(
      relevant
        .filter(
          (item) =>
            item.userId === participant.id &&
            item.response === "disliked" &&
            categoryPath(item.category).detailKey === detailCategory,
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
  caps: CategoryCaps,
) {
  if (count <= 0) return;
  const selectedIds = new Set(selected.map((candidate) => candidate.place.id));
  const majorCounts = new Map<string, number>();
  const detailCounts = new Map<string, number>();

  for (const candidate of selected) {
    majorCounts.set(
      candidate.majorCategory,
      (majorCounts.get(candidate.majorCategory) ?? 0) + 1,
    );
    if (candidate.detailCategory) {
      detailCounts.set(
        candidate.detailCategory,
        (detailCounts.get(candidate.detailCategory) ?? 0) + 1,
      );
    }
  }

  let added = 0;
  for (const candidate of pool) {
    if (added >= count) break;
    if (selectedIds.has(candidate.place.id)) continue;
    if ((majorCounts.get(candidate.majorCategory) ?? 0) >= caps.major) {
      continue;
    }
    if (
      candidate.detailCategory &&
      (detailCounts.get(candidate.detailCategory) ?? 0) >= caps.detail
    ) {
      continue;
    }

    selected.push(candidate);
    selectedIds.add(candidate.place.id);
    majorCounts.set(
      candidate.majorCategory,
      (majorCounts.get(candidate.majorCategory) ?? 0) + 1,
    );
    if (candidate.detailCategory) {
      detailCounts.set(
        candidate.detailCategory,
        (detailCounts.get(candidate.detailCategory) ?? 0) + 1,
      );
    }
    added += 1;
  }
}

function addReservedCandidates(
  selected: RankedCandidate[],
  pool: readonly RankedCandidate[],
  target: number,
  caps: CategoryCaps,
) {
  const selectedFromPool = new Set(pool.map((candidate) => candidate.place.id));
  const current = selected.filter((candidate) =>
    selectedFromPool.has(candidate.place.id),
  ).length;
  addCandidates(selected, pool, target - current, caps);
}

export function selectRecommendedCandidates(
  places: readonly PlaceCandidate[],
  context: RecommendationContext,
  limit = 8,
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
      const path = categoryPath(place.category);
      const recent = context.recentPlaceIds.has(place.id);
      return {
        place,
        majorCategory: path.major,
        detailCategory: path.detailKey,
        score: average(
          context.participants.map((participant) =>
            predictedPreference(
              participant,
              place,
              latestFeedback,
              vectors,
              context,
            ),
          ),
        ),
        accuracyRank:
          context.accuracyRanks.get(place.id) ?? Number.POSITIVE_INFINITY,
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
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.accuracyRank - right.accuracyRank ||
        left.place.id.localeCompare(right.place.id),
    );

  const selected: RankedCandidate[] = [];
  const fresh = ranked.filter(
    (candidate) => !context.recentPlaceIds.has(candidate.place.id),
  );
  const recent = ranked.filter((candidate) =>
    context.recentPlaceIds.has(candidate.place.id),
  );
  const newPlaces = fresh.filter((candidate) => candidate.newPlace);
  const rediscoveries = fresh.filter((candidate) => candidate.rediscovery);
  const newTarget = Math.min(2, limit);
  const rediscoveryTarget = Math.min(1, Math.max(0, limit - newTarget));

  for (const caps of CAP_STAGES) {
    addReservedCandidates(selected, newPlaces, newTarget, caps);
    addReservedCandidates(selected, rediscoveries, rediscoveryTarget, caps);
    if (
      selected.filter((candidate) => candidate.newPlace).length >= newTarget &&
      selected.filter((candidate) => candidate.rediscovery).length >=
        rediscoveryTarget
    ) {
      break;
    }
  }

  for (const caps of CAP_STAGES) {
    addCandidates(selected, fresh, limit - selected.length, caps);
    if (selected.length >= limit) break;
  }
  for (const caps of CAP_STAGES) {
    addCandidates(selected, recent, limit - selected.length, caps);
    if (selected.length >= limit) break;
  }

  return selected.slice(0, limit).map((candidate) => candidate.place);
}
