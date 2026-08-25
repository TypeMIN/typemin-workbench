import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  neq: vi.fn(),
}));

vi.mock("@/lib/what-should-eat/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

import { GET } from "./route";

function searchQueryResult(data: unknown[]) {
  const query = {
    select: vi.fn(),
    ilike: vi.fn(),
    neq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.ilike.mockReturnValue(query);
  query.neq.mockImplementation((...args: unknown[]) => {
    mocks.neq(...args);
    return query;
  });
  query.order.mockReturnValue(query);
  query.limit.mockResolvedValue({ data, error: null });
  return query;
}

describe("비회원 친구 검색 API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(null);
  });

  test("로그인 없이도 현재 부분 검색 결과를 최대 8명 반환한다", async () => {
    const idMatches = searchQueryResult([
      { id: 2, login_id: "bob", display_name: "밥친구" },
    ]);
    const nameMatches = searchQueryResult([
      { id: 2, login_id: "bob", display_name: "밥친구" },
      { id: 3, login_id: "carol", display_name: "친구" },
    ]);
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi
        .fn()
        .mockReturnValueOnce(idMatches)
        .mockReturnValueOnce(nameMatches),
    });

    const response = await GET(
      new Request("http://localhost/what-should-eat/api/users/search?q=친구"),
    );

    expect(response.status).toBe(200);
    expect(mocks.neq).toHaveBeenCalledWith("id", -1);
    await expect(response.json()).resolves.toEqual({
      users: [
        { id: 2, loginId: "bob", displayName: "밥친구" },
        { id: 3, loginId: "carol", displayName: "친구" },
      ],
    });
  });
});
