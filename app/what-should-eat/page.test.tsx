import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import WhatShouldEatPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

test("로그인하지 않은 사용자는 브랜드와 로그인 폼을 본다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "로그인이 필요합니다." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );

  render(<WhatShouldEatPage />);

  expect(
    await screen.findByRole("heading", { level: 1, name: "오늘 뭐 먹지?" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute(
    "href",
    "/account/sign-in?next=%2Fwhat-should-eat",
  );
  expect(screen.getByRole("link", { name: "가입" })).toHaveAttribute(
    "href",
    "/account/sign-up?next=%2Fwhat-should-eat",
  );
  expect(
    screen.queryByRole("link", { name: "Workbench 홈으로 돌아가기" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /로그인 없이 시작하기/ }),
  ).toBeVisible();
});

test("공통 계정 링크는 식사 앱으로 돌아올 경로를 유지한다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
  );
  render(<WhatShouldEatPage />);
  expect(await screen.findByRole("link", { name: "로그인" })).toHaveAttribute(
    "href",
    expect.stringContaining("next=%2Fwhat-should-eat"),
  );
});

test("비회원 상태는 현재 탭에서 새로고침해도 복원된다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "로그인이 필요합니다." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );

  const firstRender = render(<WhatShouldEatPage />);
  fireEvent.click(
    await screen.findByRole("button", { name: /로그인 없이 시작하기/ }),
  );

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "오늘 누구와 함께하나요?",
    }),
  ).toBeVisible();
  expect(sessionStorage.getItem("what_should_eat_guest")).toBe("true");

  firstRender.unmount();
  render(<WhatShouldEatPage />);

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "오늘 누구와 함께하나요?",
    }),
  ).toBeVisible();
  expect(screen.getByText("이 선택은 저장되지 않아요")).toBeVisible();
});

test("표시 이름을 변경하면 헤더와 진행 중인 참가자에 즉시 반영된다", async () => {
  const user = {
    id: 10,
    loginId: "hostuser",
    displayName: "진행자",
    birthYear: 2000,
    gender: "female",
  };
  const updatedUser = { ...user, displayName: "새 이름" };
  const fetchMock = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
    const url = String(input);
    if (url === "/what-should-eat/api/auth/me" && options?.method === "PATCH") {
      return Promise.resolve(
        new Response(JSON.stringify({ user: updatedUser }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({ user }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<WhatShouldEatPage />);
  fireEvent.click(
    await screen.findByRole("button", { name: "프로필 편집: 진행자" }),
  );
  fireEvent.change(screen.getByLabelText("표시 이름"), {
    target: { value: "새 이름" },
  });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));

  expect(
    await screen.findByRole("button", { name: "프로필 편집: 새 이름" }),
  ).toBeVisible();
  expect(screen.getAllByText("새 이름").length).toBeGreaterThanOrEqual(2);
  expect(fetchMock).toHaveBeenCalledWith(
    "/what-should-eat/api/auth/me",
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ displayName: "새 이름" }),
    }),
  );
});

test("표시 이름 변경 오류를 프로필 팝업에 표시한다", async () => {
  const user = {
    id: 10,
    loginId: "hostuser",
    displayName: "진행자",
    birthYear: 2000,
    gender: "female",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, options?: RequestInit) =>
      Promise.resolve(
        String(input) === "/what-should-eat/api/auth/me" &&
          options?.method === "PATCH"
          ? new Response(
              JSON.stringify({ error: "표시 이름을 변경하지 못했습니다." }),
              {
                status: 500,
                headers: { "Content-Type": "application/json" },
              },
            )
          : new Response(JSON.stringify({ user }), {
              headers: { "Content-Type": "application/json" },
            }),
      ),
    ),
  );

  render(<WhatShouldEatPage />);
  fireEvent.click(
    await screen.findByRole("button", { name: "프로필 편집: 진행자" }),
  );
  fireEvent.change(screen.getByLabelText("표시 이름"), {
    target: { value: "변경 이름" },
  });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));

  expect(
    await screen.findByText("표시 이름을 변경하지 못했습니다."),
  ).toBeVisible();
  expect(screen.getByRole("dialog", { name: "프로필 편집" })).toBeVisible();
});
