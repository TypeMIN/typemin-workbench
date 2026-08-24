import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import WhatShouldEatPage from "./page";

afterEach(() => {
  vi.unstubAllGlobals();
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
  expect(screen.getByRole("tab", { name: "로그인" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByLabelText("ID")).toBeRequired();
});

test("가입 화면의 ID 중복확인은 앱 전용 API를 사용한다", async () => {
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/what-should-eat/api/auth/check-id")) {
      return Promise.resolve(
        new Response(JSON.stringify({ available: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({ error: "로그인이 필요합니다." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<WhatShouldEatPage />);
  await screen.findByRole("tab", { name: "로그인" });
  fireEvent.click(screen.getByRole("tab", { name: "처음이에요" }));
  fireEvent.change(screen.getByLabelText("ID"), {
    target: { value: "FreshUser" },
  });
  fireEvent.click(screen.getByRole("button", { name: "중복확인" }));

  expect(
    await screen.findByText("사용할 수 있는 ID입니다."),
  ).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    "/what-should-eat/api/auth/check-id?loginId=freshuser",
    expect.anything(),
  );
});
