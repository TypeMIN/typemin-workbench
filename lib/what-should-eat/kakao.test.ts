import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { searchNearbyRestaurants } from "@/lib/what-should-eat/kakao";

function kakaoPlace(id: string, distance: number) {
  return {
    id,
    place_name: `식당 ${id}`,
    category_name: "음식점 > 한식 > 국수 > 칼국수",
    distance: String(distance),
    address_name: "서울",
    road_address_name: "서울 테스트로",
    place_url: "",
    x: "127",
    y: "37.5",
  };
}

describe("카카오 주변 음식점 혼합 수집", () => {
  beforeEach(() => {
    vi.stubEnv("KAKAO_REST_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("정확도순과 거리순을 각각 45곳까지 조회하고 정확도순 우선으로 중복 제거한다", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const sort = url.searchParams.get("sort");
      const page = Number(url.searchParams.get("page"));
      const documents = Array.from({ length: 15 }, (_, index) => {
        const number = (page - 1) * 15 + index + 1;
        const id =
          sort === "distance" && number === 1
            ? "accuracy-1"
            : `${sort}-${number}`;
        return kakaoPlace(id, number * 10);
      });
      return Response.json({ documents, meta: { is_end: page === 3 } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchNearbyRestaurants(37.5, 127);
    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input)));

    expect(
      urls.filter((url) => url.searchParams.get("sort") === "accuracy"),
    ).toHaveLength(3);
    expect(
      urls.filter((url) => url.searchParams.get("sort") === "distance"),
    ).toHaveLength(3);
    expect(
      urls.every(
        (url) =>
          url.searchParams.get("radius") === "1000" &&
          url.searchParams.get("size") === "15",
      ),
    ).toBe(true);
    expect(result.places).toHaveLength(89);
    expect(result.places[0].id).toBe("accuracy-1");
    expect(result.accuracyRanks.get("accuracy-1")).toBe(1);
    expect(result.accuracyRanks.has("distance-2")).toBe(false);
  });

  test("한 정렬이 실패하면 성공한 정렬의 결과로 진행한다", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.searchParams.get("sort") === "accuracy") {
        throw new Error("accuracy failed");
      }
      return Response.json({
        documents: [kakaoPlace("distance-only", 100)],
        meta: { is_end: true },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchNearbyRestaurants(37.5, 127)).resolves.toEqual({
      places: [
        expect.objectContaining({ id: "distance-only", distanceMeters: 100 }),
      ],
      accuracyRanks: new Map(),
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "카카오 정확도순 음식점 조회 실패",
      expect.any(Error),
    );
  });

  test("두 정렬이 모두 실패하면 후보 조회를 실패 처리한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("kakao failed");
      }),
    );

    await expect(searchNearbyRestaurants(37.5, 127)).rejects.toThrow(
      "카카오 음식점 검색에 모두 실패했습니다.",
    );
  });
});
