import { describe, expect, test } from "vitest";

import {
  getMajorCategory,
  selectRecommendedCandidates,
  type FeedbackSignal,
  type RecommendationContext,
} from "@/lib/what-should-eat/recommendation";
import type { PlaceCandidate } from "@/lib/what-should-eat/types";

function place(
  id: string,
  category: string,
  distanceMeters = 100,
): PlaceCandidate {
  return {
    id,
    name: `식당 ${id}`,
    category,
    distanceMeters,
    address: "서울",
    roadAddress: "서울",
    placeUrl: "",
    latitude: 37.5,
    longitude: 127,
  };
}

function feedback(
  placeId: string,
  category: string,
  response: FeedbackSignal["response"],
  userId = 1,
  updatedAt = "2026-08-20T00:00:00Z",
): FeedbackSignal {
  return { userId, placeId, category, response, updatedAt };
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
    accuracyRanks: new Map(),
    ...overrides,
  };
}

describe("목표 추천 알고리즘", () => {
  test("참가자가 직접 싫다고 평가한 식당은 후보에서 제외한다", () => {
    const disliked = place("1", "음식점 > 한식 > 국수 > 칼국수");
    const alternative = place("2", "음식점 > 일식 > 면 > 우동");
    const selected = selectRecommendedCandidates(
      [disliked, alternative],
      context({
        feedback: [feedback(disliked.id, disliked.category, "disliked")],
      }),
    );

    expect(selected.map((candidate) => candidate.id)).toEqual([alternative.id]);
  });

  test("같은 소분류 싫어요는 서로 다른 세 곳부터 해당 소분류를 제외한다", () => {
    const target = place("target", "음식점 > 한식 > 국수 > 칼국수");
    const alternative = place("other", "음식점 > 일식 > 면 > 우동");
    const twoDislikes = ["old-1", "old-2"].map((id) =>
      feedback(id, target.category, "disliked"),
    );

    expect(
      selectRecommendedCandidates(
        [target, alternative],
        context({ feedback: twoDislikes }),
      ).map((candidate) => candidate.id),
    ).toContain(target.id);
    expect(
      selectRecommendedCandidates(
        [target, alternative],
        context({
          feedback: [
            ...twoDislikes,
            feedback("old-3", target.category, "disliked"),
          ],
        }),
      ).map((candidate) => candidate.id),
    ).not.toContain(target.id);
  });

  test("소분류가 없으면 중분류를 사용하고 대분류만으로는 제외하지 않는다", () => {
    const middleOnly = place("middle", "음식점 > 한식 > 국수");
    const majorOnly = place("major", "음식점 > 한식");
    const middleDislikes = ["middle-1", "middle-2", "middle-3"].map((id) =>
      feedback(id, middleOnly.category, "disliked"),
    );
    const majorDislikes = ["major-1", "major-2", "major-3"].map((id) =>
      feedback(id, majorOnly.category, "disliked"),
    );
    const selected = selectRecommendedCandidates(
      [middleOnly, majorOnly],
      context({ feedback: [...middleDislikes, ...majorDislikes] }),
    );

    expect(selected.map((candidate) => candidate.id)).not.toContain(
      middleOnly.id,
    );
    expect(selected.map((candidate) => candidate.id)).toContain(majorOnly.id);
  });

  test("계층형 평가에서는 더 구체적인 소분류 기록이 우선한다", () => {
    const kalguksu = place("kalguksu", "음식점 > 한식 > 국수 > 칼국수");
    const barbecue = place("barbecue", "음식점 > 한식 > 육류 > 돼지고기");
    const selected = selectRecommendedCandidates(
      [barbecue, kalguksu],
      context({
        feedback: [
          feedback("liked-noodle", kalguksu.category, "liked"),
          feedback("disliked-meat", barbecue.category, "disliked"),
        ],
        visitedPlaceIds: new Set([kalguksu.id, barbecue.id]),
        accuracyRanks: new Map([
          [barbecue.id, 1],
          [kalguksu.id, 2],
        ]),
      }),
      1,
    );

    expect(selected[0].id).toBe(kalguksu.id);
  });

  test("A/B 승패 기록을 최대 0.3의 명시적 취향 신호로 반영한다", () => {
    const noodle = place("noodle", "음식점 > 한식 > 국수 > 칼국수");
    const sushi = place("sushi", "음식점 > 일식 > 회 > 초밥");
    const selected = selectRecommendedCandidates(
      [noodle, sushi],
      context({
        comparisons: [
          {
            hostUserId: 1,
            winnerCategory: sushi.category,
            loserCategory: noodle.category,
          },
        ],
        visitedPlaceIds: new Set([noodle.id, sushi.id]),
        accuracyRanks: new Map([
          [noodle.id, 1],
          [sushi.id, 2],
        ]),
      }),
      1,
    );

    expect(selected[0].id).toBe(sushi.id);
  });

  test("거리 대신 정확도 순위를 동점 기준으로 사용한다", () => {
    const nearby = place("nearby", "음식점 > 한식 > 국수 > 칼국수", 10);
    const accurate = place("accurate", "음식점 > 일식 > 면 > 우동", 990);
    const selected = selectRecommendedCandidates(
      [nearby, accurate],
      context({
        visitedPlaceIds: new Set([nearby.id, accurate.id]),
        accuracyRanks: new Map([
          [accurate.id, 1],
          [nearby.id, 2],
        ]),
      }),
      1,
    );

    expect(selected[0].id).toBe(accurate.id);
  });

  test("한 참가자의 직접 비선호는 그룹 평균보다 먼저 후보를 제외한다", () => {
    const vetoed = place("vetoed", "음식점 > 한식 > 국수 > 칼국수");
    const safe = place("safe", "음식점 > 일식 > 면 > 우동");
    const selected = selectRecommendedCandidates(
      [vetoed, safe],
      context({
        participants: [
          { id: 1, birthYear: 2000, gender: "female" },
          { id: 2, birthYear: 1999, gender: "male" },
        ],
        feedback: [
          feedback(vetoed.id, vetoed.category, "liked", 1),
          feedback(vetoed.id, vetoed.category, "disliked", 2),
        ],
      }),
    );

    expect(selected.map((candidate) => candidate.id)).toEqual([safe.id]);
  });

  test("개인 데이터가 없으면 같은 연령대와 성별의 평가를 제한적으로 사용한다", () => {
    const korean = place("korean", "음식점 > 한식 > 백반 > 가정식");
    const japanese = place("japanese", "음식점 > 일식 > 회 > 초밥");
    const population = [
      { id: 1, birthYear: 2000, gender: "female" as const },
      { id: 2, birthYear: 1998, gender: "female" as const },
      { id: 3, birthYear: 2001, gender: "female" as const },
      { id: 4, birthYear: 1999, gender: "female" as const },
    ];
    const populationFeedback = population
      .slice(1)
      .flatMap((user, index) => [
        feedback(`k-${index}`, korean.category, "liked", user.id),
        feedback(`j-${index}`, japanese.category, "disliked", user.id),
      ]);
    const selected = selectRecommendedCandidates(
      [japanese, korean],
      context({
        population,
        feedback: populationFeedback,
        visitedPlaceIds: new Set([korean.id, japanese.id]),
      }),
      1,
    );

    expect(selected[0].id).toBe(korean.id);
  });

  test("직접 좋아요가 인구통계와 전체 평가보다 우선한다", () => {
    const korean = place("korean", "음식점 > 한식 > 백반 > 가정식");
    const japanese = place("japanese", "음식점 > 일식 > 회 > 초밥");
    const population = [
      { id: 1, birthYear: 2000, gender: "female" as const },
      { id: 2, birthYear: 1998, gender: "female" as const },
      { id: 3, birthYear: 2001, gender: "female" as const },
      { id: 4, birthYear: 1999, gender: "female" as const },
    ];
    const selected = selectRecommendedCandidates(
      [korean, japanese],
      context({
        population,
        feedback: [
          feedback(japanese.id, japanese.category, "liked"),
          ...population
            .slice(1)
            .flatMap((user, index) => [
              feedback(`k-${index}`, korean.category, "liked", user.id),
              feedback(`j-${index}`, japanese.category, "disliked", user.id),
            ]),
        ],
        visitedPlaceIds: new Set([korean.id, japanese.id]),
      }),
      1,
    );

    expect(selected[0].id).toBe(japanese.id);
  });

  test("새 식당 두 곳과 좋아했던 식당 한 곳의 탐색 자리를 우선 확보한다", () => {
    const newPlaces = [
      place("new-1", "음식점 > 한식 > 국수 > 칼국수"),
      place("new-2", "음식점 > 일식 > 면 > 우동"),
    ];
    const likedPlaces = Array.from({ length: 8 }, (_, index) =>
      place(
        `liked-${index}`,
        `음식점 > ${index % 2 ? "중식" : "양식"} > 요리${index} > 메뉴${index}`,
      ),
    );
    const allPlaces = [...likedPlaces, ...newPlaces];
    const selected = selectRecommendedCandidates(
      allPlaces,
      context({
        feedback: likedPlaces.map((candidate) =>
          feedback(candidate.id, candidate.category, "liked"),
        ),
        visitedPlaceIds: new Set(likedPlaces.map((candidate) => candidate.id)),
        accuracyRanks: new Map(
          allPlaces.map((candidate, index) => [candidate.id, index + 1]),
        ),
      }),
    );

    expect(selected).toHaveLength(8);
    expect(selected.map((candidate) => candidate.id)).toEqual(
      expect.arrayContaining(newPlaces.map((candidate) => candidate.id)),
    );
    expect(
      selected.filter((candidate) => candidate.id.startsWith("liked-")),
    ).not.toHaveLength(0);
  });

  test("후보 풀이 충분하면 대분류 세 곳·세부분류 두 곳 상한을 지킨다", () => {
    const majors = ["한식", "일식", "중식", "양식"];
    const places = majors.flatMap((major) =>
      Array.from({ length: 4 }, (_, index) =>
        place(
          `${major}-${index}`,
          `음식점 > ${major} > 공통중분류 > ${index < 3 ? "공통소분류" : `소분류${index}`}`,
        ),
      ),
    );
    const selected = selectRecommendedCandidates(
      places,
      context({
        accuracyRanks: new Map(
          places.map((candidate, index) => [candidate.id, index + 1]),
        ),
      }),
    );
    const majorCounts = new Map<string, number>();
    const detailCounts = new Map<string, number>();
    for (const candidate of selected) {
      const levels = candidate.category.split(" > ");
      const major = getMajorCategory(candidate.category);
      const detail = levels.slice(1).join(" > ");
      majorCounts.set(major, (majorCounts.get(major) ?? 0) + 1);
      detailCounts.set(detail, (detailCounts.get(detail) ?? 0) + 1);
    }

    expect(selected).toHaveLength(8);
    expect(Math.max(...majorCounts.values())).toBeLessThanOrEqual(3);
    expect(Math.max(...detailCounts.values())).toBeLessThanOrEqual(2);
  });

  test("한 대분류뿐이면 상한을 단계적으로 완화해 여덟 곳을 채운다", () => {
    const places = Array.from({ length: 8 }, (_, index) =>
      place(
        `korean-${index}`,
        `음식점 > 한식 > 중분류${index} > 소분류${index}`,
      ),
    );
    const selected = selectRecommendedCandidates(places, context());

    expect(selected).toHaveLength(8);
  });

  test("최근 7일 식당은 점수가 높아도 신선한 후보가 있으면 후순위로 둔다", () => {
    const recent = place("recent", "음식점 > 한식 > 국수 > 칼국수");
    const fresh = place("fresh", "음식점 > 일식 > 면 > 우동");
    const selected = selectRecommendedCandidates(
      [recent, fresh],
      context({
        feedback: [feedback(recent.id, recent.category, "liked")],
        recentPlaceIds: new Set([recent.id]),
        visitedPlaceIds: new Set([recent.id, fresh.id]),
      }),
      1,
    );

    expect(selected[0].id).toBe(fresh.id);
  });
});
