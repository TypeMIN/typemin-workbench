import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  toAppUser: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/what-should-eat/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
  toAppUser: mocks.toAppUser,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

import { PATCH } from "./route";

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
    mocks.getCurrentUser.mockResolvedValue(currentUser);
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({ update: mocks.update })),
    });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.toAppUser.mockImplementation((row) => ({
      id: Number(row.id),
      loginId: row.login_id,
      displayName: row.display_name,
      birthYear: row.birth_year,
      gender: row.gender,
    }));
  });

  test("로그인하지 않은 요청을 거부한다", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await PATCH(patchRequest("새 이름"));

    expect(response.status).toBe(401);
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  test("공백 제거 후 1~30자만 허용한다", async () => {
    const emptyResponse = await PATCH(patchRequest("   "));
    const longResponse = await PATCH(patchRequest("가".repeat(31)));

    expect(emptyResponse.status).toBe(400);
    expect(longResponse.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  test("현재 세션 사용자 행만 수정하고 갱신된 사용자를 반환한다", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: 7,
        login_id: "hostuser",
        display_name: "새 이름",
        birth_year: 2000,
        gender: "female",
      },
      error: null,
    });

    const response = await PATCH(patchRequest("  새 이름  "));

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ display_name: "새 이름" });
    expect(mocks.eq).toHaveBeenCalledWith("id", 7);
    await expect(response.json()).resolves.toEqual({
      user: { ...currentUser, displayName: "새 이름" },
    });
  });

  test("DB 수정 실패를 일반 오류로 반환한다", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "database error" },
    });

    const response = await PATCH(patchRequest("새 이름"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "표시 이름을 변경하지 못했습니다.",
    });
  });
});
