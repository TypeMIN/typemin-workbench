import { describe, expect, test } from "vitest";

import {
  getMajorCategory,
  selectRecommendedCandidates,
  type RecommendationContext,
} from "@/lib/what-should-eat/recommendation";
import type { PlaceCandidate } from "@/lib/what-should-eat/types";

function place(
  id: string,
  majorCategory: string,
  distanceMeters = 100,
): PlaceCandidate {
  return {
    id,
    name: `식당 ${id}`,
    category: `음식점 > ${majorCategory} > 전문점`,
    distanceMeters,
    address: "서울",
    roadAddress: "서울",
    placeUrl: "",
    latitude: 37.5,
    longitude: 127,
  };
}

function context(
  overrides: Partial<RecommendationContext> = {},
): RecommendationContext {
  return {
    participants: [{ id: 1, birthYear: 2000, gender: "female" }],
    population: [{ id: 1, birthYear: 2000, gender: "female" }],
    feedback: [],
    comparisons: [],
    recentPlaceIds: new Set(),
    visitedPlaceIds: new Set(),
    recentCategoryCounts: new Map(),
    ...overrides,
  };
}

describe("목표 추천 알고리즘", () => {
  test("참가자가 직접 싫다고 평가한 식당은 후보에서 제외한다", () => {
    const places = Array.from({ length: 9 }, (_, index) =>
      place(String(index + 1), index % 2 ? "일식" : "한식"),
    );
    const selected = selectRecommendedCandidates(
      places,
      context({
        feedback: [
          {
            userId: 1,
            placeId: "1",
            category: places[0].category,
            response: "disliked",
            updatedAt: "2026-08-20T00:00:00Z",
          },
        ],
      }),
      8,
      () => 0,
    );

    expect(selected.map((candidate) => candidate.id)).not.toContain("1");
  });

  test("서로 다른 두 식당에서 싫다고 한 대분류는 강한 비선호로 제외한다", () => {
    const places = [place("1", "한식"), place("2", "일식"), place("3", "중식")];
    const selected = selectRecommendedCandidates(
      places,
      context({
        feedback: [
          {
            userId: 1,
            placeId: "old-1",
            category: "음식점 > 한식 > 백반",
            response: "disliked",
            updatedAt: "2026-08-19T00:00:00Z",
          },
          {
            userId: 1,
            placeId: "old-2",
            category: "음식점 > 한식 > 국밥",
            response: "disliked",
            updatedAt: "2026-08-20T00:00:00Z",
          },
        ],
      }),
      3,
      () => 0,
    );

    expect(
      selected.map((candidate) => getMajorCategory(candidate.category)),
    ).not.toContain("한식");
  });

  test("후보 풀이 충분하면 동일 대분류를 최대 두 곳만 선택한다", () => {
    const majors = ["한식", "일식", "중식", "양식"];
    const places = majors.flatMap((major) =>
      Array.from({ length: 3 }, (_, index) =>
        place(`${major}-${index}`, major),
      ),
    );
    const selected = selectRecommendedCandidates(places, context(), 8, () => 0);
    const counts = new Map<string, number>();
    for (const candidate of selected) {
      const major = getMajorCategory(candidate.category);
      counts.set(major, (counts.get(major) ?? 0) + 1);
    }

    expect(selected).toHaveLength(8);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    expect(counts.size).toBeGreaterThanOrEqual(4);
  });

  test("개인 데이터가 없으면 같은 연령대와 성별의 평가를 초기값으로 사용한다", () => {
    const korean = place("korean", "한식");
    const japanese = place("japanese", "일식");
    const population = [
      { id: 1, birthYear: 2000, gender: "female" as const },
      { id: 2, birthYear: 1998, gender: "female" as const },
      { id: 3, birthYear: 2001, gender: "female" as const },
      { id: 4, birthYear: 1999, gender: "female" as const },
    ];
    const feedback = population.slice(1).flatMap((user, index) => [
      {
        userId: user.id,
        placeId: `k-${index}`,
        category: korean.category,
        response: "liked" as const,
        updatedAt: "2026-08-20T00:00:00Z",
      },
      {
        userId: user.id,
        placeId: `j-${index}`,
        category: japanese.category,
        response: "disliked" as const,
        updatedAt: "2026-08-20T00:00:00Z",
      },
    ]);
    const [selected] = selectRecommendedCandidates(
      [japanese, korean],
      context({ population, feedback }),
      1,
      () => 0,
    );

    expect(selected.id).toBe("korean");
  });

  test("직접 남긴 개인 평가는 인구통계 초기값보다 우선한다", () => {
    const korean = place("korean", "한식");
    const japanese = place("japanese", "일식");
    const population = [
      { id: 1, birthYear: 2000, gender: "female" as const },
      { id: 2, birthYear: 1998, gender: "female" as const },
      { id: 3, birthYear: 2001, gender: "female" as const },
      { id: 4, birthYear: 1999, gender: "female" as const },
    ];
    const feedback = [
      {
        userId: 1,
        placeId: japanese.id,
        category: japanese.category,
        response: "liked" as const,
        updatedAt: "2026-08-21T00:00:00Z",
      },
      ...population.slice(1).flatMap((user, index) => [
        {
          userId: user.id,
          placeId: `k-${index}`,
          category: korean.category,
          response: "liked" as const,
          updatedAt: "2026-08-20T00:00:00Z",
        },
        {
          userId: user.id,
          placeId: `j-${index}`,
          category: japanese.category,
          response: "disliked" as const,
          updatedAt: "2026-08-20T00:00:00Z",
        },
      ]),
    ];
    const [selected] = selectRecommendedCandidates(
      [korean, japanese],
      context({ population, feedback }),
      1,
      () => 0,
    );

    expect(selected.id).toBe("japanese");
  });
});
