import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAccount: vi.fn(),
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@/lib/workbench/auth", () => ({
  getCurrentAccount: mocks.getCurrentAccount,
}));
vi.mock("@/lib/what-should-eat/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

import { PATCH } from "./route";

const account = {
  id: 7,
  loginId: "hostuser",
  displayName: "기존 이름",
  role: "owner",
  mustChangePin: false,
};
const currentUser = {
  id: 7,
  loginId: "hostuser",
  displayName: "기존 이름",
  birthYear: 2000,
  gender: "female",
};

function patchRequest(displayName: unknown) {
  return new Request("http://localhost/what-should-eat/api/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
}

describe("표시 이름 수정 API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentAccount.mockResolvedValue(account);
    mocks.getCurrentUser.mockResolvedValue({
      ...currentUser,
      displayName: "새 이름",
    });
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({ update: mocks.update })),
    });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({ error: null });
  });

  test("로그인하지 않은 요청을 거부한다", async () => {
    mocks.getCurrentAccount.mockResolvedValue(null);
    const response = await PATCH(patchRequest("새 이름"));
    expect(response.status).toBe(401);
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  test("공백 제거 후 1~30자만 허용한다", async () => {
    expect((await PATCH(patchRequest("   "))).status).toBe(400);
    expect((await PATCH(patchRequest("가".repeat(31)))).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  test("공통 계정 행만 수정하고 식사 프로필을 합쳐 반환한다", async () => {
    const response = await PATCH(patchRequest("  새 이름  "));
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: "새 이름" }),
    );
    expect(mocks.eq).toHaveBeenCalledWith("id", 7);
    await expect(response.json()).resolves.toEqual({
      user: { ...currentUser, displayName: "새 이름" },
    });
  });

  test("DB 수정 실패를 일반 오류로 반환한다", async () => {
    mocks.eq.mockResolvedValue({ error: { message: "database error" } });
    const response = await PATCH(patchRequest("새 이름"));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "표시 이름을 변경하지 못했습니다.",
    });
  });
});
