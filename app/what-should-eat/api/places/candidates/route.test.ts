import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  searchNearbyRestaurants: vi.fn(),
  selectRecommendedCandidates: vi.fn(),
}));

vi.mock("@/lib/what-should-eat/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

vi.mock("@/lib/what-should-eat/kakao", () => ({
  searchNearbyRestaurants: mocks.searchNearbyRestaurants,
}));

vi.mock("@/lib/what-should-eat/recommendation", () => ({
  selectRecommendedCandidates: mocks.selectRecommendedCandidates,
}));

import { POST } from "./route";

const place = {
  id: "place-1",
  name: "테스트 식당",
  category: "음식점 > 한식",
  distanceMeters: 100,
  address: "서울특별시",
  roadAddress: "서울특별시 테스트로",
  placeUrl: "",
  latitude: 37.5,
  longitude: 127,
};

function thenableQuery(data: unknown[]) {
  const result = { data, error: null };
  const query = {
    select: vi.fn(),
    in: vi.fn(),
    neq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    then: (
      resolve: (value: typeof result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.neq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

function candidateRequest(participantIds: number[]) {
  return new Request("http://localhost/what-should-eat/api/places/candidates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      latitude: 37.5,
      longitude: 127,
      participantIds,
    }),
  });
}

describe("비회원 후보 추천 API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.searchNearbyRestaurants.mockResolvedValue([place]);
    mocks.selectRecommendedCandidates.mockReturnValue([place]);
  });

  test("가입 친구가 없어도 비개인화 후보를 반환한다", async () => {
    const from = vi.fn(() => thenableQuery([]));
    mocks.getSupabaseAdmin.mockReturnValue({ from });

    const response = await POST(candidateRequest([]));

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledTimes(1);
    expect(mocks.selectRecommendedCandidates).toHaveBeenCalledWith(
      [place],
      expect.objectContaining({ participants: [] }),
    );
    await expect(response.json()).resolves.toEqual({ candidates: [place] });
  });

  test("추가한 가입 친구만 개인화 참가자로 사용한다", async () => {
    const from = vi.fn((table: string) =>
      thenableQuery(
        table === "what_should_eat_users"
          ? [{ id: 11, birth_year: 1998, gender: "female" }]
          : [],
      ),
    );
    mocks.getSupabaseAdmin.mockReturnValue({ from });

    const response = await POST(candidateRequest([11]));

    expect(response.status).toBe(200);
    expect(mocks.selectRecommendedCandidates).toHaveBeenCalledWith(
      [place],
      expect.objectContaining({
        participants: [{ id: 11, birthYear: 1998, gender: "female" }],
      }),
    );
  });
});
