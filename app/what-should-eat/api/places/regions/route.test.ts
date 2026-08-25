import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ searchRegions: vi.fn() }));

vi.mock("@/lib/what-should-eat/kakao", () => ({
  searchRegions: mocks.searchRegions,
}));

import { GET } from "./route";

describe("비회원 지역 검색 API", () => {
  beforeEach(() => vi.clearAllMocks());

  test("로그인 없이도 유효한 지역 검색을 처리한다", async () => {
    const regions = [
      {
        id: "region-1",
        name: "서울역",
        address: "서울특별시 중구",
        latitude: 37.55,
        longitude: 126.97,
      },
    ];
    mocks.searchRegions.mockResolvedValue(regions);

    const response = await GET(
      new Request(
        "http://localhost/what-should-eat/api/places/regions?q=서울역",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.searchRegions).toHaveBeenCalledWith("서울역");
    await expect(response.json()).resolves.toEqual({ regions });
  });
});
