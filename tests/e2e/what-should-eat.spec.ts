import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

const user = {
  id: 10,
  loginId: "hostuser",
  displayName: "진행자",
  birthYear: 2000,
  gender: "prefer_not_to_say",
};
const friend = { id: 11, loginId: "frienduser", displayName: "친구" };
const candidates = Array.from({ length: 3 }, (_, index) => ({
  id: String(index + 1),
  name: `테스트 식당 ${index + 1}`,
  category: `음식점 > 한식 > 국수 > 칼국수 > 테스트 식당 ${index + 1}`,
  distanceMeters: 50 + index * 10,
  address: "서울시 강남구",
  roadAddress: "서울시 강남구 테스트로",
  placeUrl: "",
  latitude: 37.5,
  longitude: 127,
}));

test("공통 계정 링크와 비회원 체험을 제공한다", async ({ page }) => {
  await page.route("**/what-should-eat/api/auth/me", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "로그인이 필요합니다." }),
    }),
  );
  await page.goto("/what-should-eat");

  await expect(page).toHaveTitle("오늘 뭐 먹지?");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "오늘 뭐 먹지?",
  );
  await expect(page.getByText("고민은 짧게,")).toHaveCount(0);
  await expect(page.getByText("멤버 모으기")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "로그인" })).toHaveAttribute(
    "href",
    "/account/sign-in?next=%2Fwhat-should-eat",
  );
  await expect(page.getByRole("link", { name: "가입" })).toHaveAttribute(
    "href",
    "/account/sign-up?next=%2Fwhat-should-eat",
  );
  await expect(
    page.getByRole("link", { name: "Workbench 홈으로 돌아가기" }),
  ).toHaveAttribute("href", "/");
  await expect(page.getByText(/못 먹는 음식/)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /로그인 없이 시작하기/ }),
  ).toBeVisible();
});

test("비회원이 친구를 추가해 결과까지 보고 탭 상태를 복원한다", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 37.5, longitude: 127 });

  let candidateParticipantIds: number[] | null = null;
  let decisionRequests = 0;
  let feedbackRequests = 0;
  await page.route("**/what-should-eat/api/auth/me", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "로그인이 필요합니다." }),
    }),
  );
  await page.route("**/what-should-eat/api/users/search?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ users: [friend] }),
    }),
  );
  await page.route("**/what-should-eat/api/places/candidates", (route) => {
    candidateParticipantIds = route.request().postDataJSON().participantIds;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ candidates }),
    });
  });
  await page.route("**/what-should-eat/api/decisions", (route) => {
    decisionRequests += 1;
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "비회원은 호출하면 안 됩니다." }),
    });
  });
  await page.route("**/what-should-eat/api/feedback", (route) => {
    feedbackRequests += 1;
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "비회원은 호출하면 안 됩니다." }),
    });
  });

  await page.goto("/what-should-eat");
  await page.getByRole("button", { name: /로그인 없이 시작하기/ }).click();
  await expect(page.getByText("이 선택은 저장되지 않아요")).toBeVisible();
  await expect(page.getByRole("button", { name: "지난 선택" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await page.getByLabel("친구 ID 또는 표시 이름").fill("친구");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await page.getByRole("button", { name: "추가", exact: true }).click();
  await expect(page.getByText("2명이 함께 골라요")).toBeVisible();
  await page.getByRole("button", { name: /위치 정하기/ }).click();
  await page.getByRole("button", { name: /내 현재 위치 사용하기/ }).click();
  await expect(page.getByText("ROUND 1 / 2")).toBeVisible();
  expect(candidateParticipantIds).toEqual([friend.id]);
  await page.locator(".place-card").first().click();
  await page.locator(".place-card").first().click();

  await expect(page.getByText("오늘의 선택")).toBeVisible();
  await expect(page.getByText("비회원 선택은 저장되지 않아요.")).toBeVisible();
  await expect(page.getByRole("button", { name: "좋다" })).toHaveCount(0);
  await expect(page.getByText(/지난 선택에 저장됐어요/)).toHaveCount(0);
  await expect(page.locator(".result-meta")).toContainText("비회원");
  await expect(page.locator(".result-meta")).toContainText("친구");
  expect(decisionRequests).toBe(0);
  expect(feedbackRequests).toBe(0);
  await expectNoHorizontalOverflow(page);

  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem("what_should_eat_guest")),
    )
    .toBe("true");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "오늘 누구와 함께하나요?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "로그인/가입" }).click();
  await expect(page.getByRole("link", { name: "로그인" })).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("what_should_eat_guest")),
  ).toBeNull();
});

test("회원이 프로필 팝업에서 표시 이름을 변경한다", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const updatedUser = { ...user, displayName: "새 진행자" };
  await page.route("**/what-should-eat/api/auth/me", (route) => {
    const responseUser =
      route.request().method() === "PATCH" ? updatedUser : user;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ user: responseUser }),
    });
  });
  await page.route("**/what-should-eat/api/decisions", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        decisions: [
          {
            id: 1,
            place: candidates[0],
            participants: [user],
            decidedAt: "2026-08-20T02:00:00.000Z",
            myFeedback: null,
          },
        ],
      }),
    }),
  );
  await page.route("**/what-should-eat/api/feedback", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ feedback: [] }),
    }),
  );

  await page.goto("/what-should-eat");
  await page.getByRole("button", { name: "프로필 편집: 진행자" }).click();
  await expect(page.getByRole("dialog", { name: "프로필 편집" })).toBeVisible();
  await page
    .getByRole("dialog", { name: "프로필 편집" })
    .getByRole("textbox", { name: "표시 이름", exact: true })
    .fill("새 진행자");
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "저장" }).click();

  await expect(
    page.getByRole("button", { name: "프로필 편집: 새 진행자" }),
  ).toBeVisible();
  await expect(page.locator(".member-list")).toContainText("새 진행자");
  await page.getByRole("button", { name: "지난 선택" }).click();
  await expect(page.locator(".history-members")).toContainText("새 진행자");
});

test("현재 위치와 참가자 선택부터 A/B 결과와 이력까지 완주한다", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 37.5, longitude: 127 });
  await page.route("**/what-should-eat/api/auth/me", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ user }),
    }),
  );
  await page.route("**/what-should-eat/api/users/search?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ users: [friend] }),
    }),
  );
  await page.route("**/what-should-eat/api/places/candidates", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ candidates }),
    }),
  );
  await page.route("**/what-should-eat/api/places/search?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ places: [candidates[1]] }),
    }),
  );
  await page.route("**/what-should-eat/api/feedback", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ feedback: [] }),
      });
    }
    const body = route.request().postDataJSON();
    const place = body.place ?? candidates[0];
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        feedback: {
          id: 1,
          place,
          response: body.response,
          source: body.decisionId ? "decision" : "manual",
          decisionId: body.decisionId ?? null,
          updatedAt: new Date().toISOString(),
        },
      }),
    });
  });
  await page.route("**/what-should-eat/api/decisions", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          decision: { id: 1, decidedAt: new Date().toISOString() },
        }),
      });
    }
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        decisions: [
          {
            id: 1,
            place: candidates[0],
            participants: [user, friend],
            decidedAt: "2026-08-20T02:00:00.000Z",
            myFeedback: "liked",
          },
        ],
      }),
    });
  });

  await page.goto("/what-should-eat");
  await expect(page.getByRole("banner").getByText("@hostuser")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByLabel("친구 ID 또는 표시 이름").fill("친구");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await page.getByRole("button", { name: "추가", exact: true }).click();
  await expect(page.getByText("2명이 함께 골라요")).toBeVisible();
  await page.getByRole("button", { name: /위치 정하기/ }).click();

  await page.getByRole("button", { name: /내 현재 위치 사용하기/ }).click();
  await expect(page.getByText("ROUND 1 / 2")).toBeVisible();
  await expect(page.getByText("VS", { exact: true })).toBeVisible();
  await expect(
    page.locator(".place-card").first().locator(".category"),
  ).toHaveText("한식 · 국수 · 칼국수");
  await expect(page.locator(".category-badge")).toHaveCount(2);
  await expect(page.getByText(/도보 1분/).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.locator(".place-card").first().click();
  await expect(page.getByText("ROUND 2 / 2")).toBeVisible();
  await page.locator(".place-card").first().click();

  await expect(page.getByText("오늘의 선택")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const resultMembers = page.locator(".result-meta .participant-names");
  await expect(resultMembers).toContainText("진행자");
  await expect(resultMembers).toContainText("@hostuser");
  await expect(resultMembers).toContainText("친구");
  await expect(resultMembers).toContainText("@frienduser");
  await expect(
    page.getByText("선택 결과가 지난 선택에 저장됐어요."),
  ).toBeVisible();
  await page.getByRole("button", { name: "좋다" }).click();
  await expect(page.getByRole("button", { name: "좋다" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "지난 선택" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "테스트 식당 1" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const members = page.locator(".history-members");
  await expect(members).toContainText("진행자");
  await expect(members).toContainText("@hostuser");
  await expect(members).toContainText("친구");
  await expect(members).toContainText("@frienduser");
  await page.getByLabel("평가할 식당 이름").fill("테스트 식당");
  await page.getByRole("button", { name: "찾기", exact: true }).click();
  await expect(page.getByText("테스트 식당 2")).toBeVisible();
});

test("실제 API에서 가입·로그인·결정·피드백을 저장한다", async ({ page }) => {
  test.skip(
    process.env.WORKBENCH_DATABASE_E2E !== "true",
    "공유 Supabase에 쓰는 배포 검증에서만 실행합니다.",
  );

  const loginId = `e2e${Date.now().toString(36).slice(-8)}`;
  const pin = "123456";
  const place = {
    id: `e2e-place-${loginId}`,
    name: "Workbench E2E 식당",
    category: "음식점 > 한식",
    distanceMeters: 100,
    address: "서울특별시",
    roadAddress: "서울특별시 테스트로 1",
    placeUrl: "",
    latitude: 37.5665,
    longitude: 126.978,
  };

  await page.goto("/what-should-eat");
  const origin = new URL(page.url()).origin;
  const signup = await page.request.post("/api/workbench/auth/sign-up", {
    headers: { Origin: origin },
    data: {
      loginId,
      pin,
      displayName: "E2E 사용자",
    },
  });
  expect(signup.status()).toBe(201);
  const signupBody = (await signup.json()) as { account: { id: number } };

  const sessionCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === "workbench_session",
  );
  expect(sessionCookie?.path).toBe("/");

  const mealProfile = await page.request.post("/what-should-eat/api/profile", {
    headers: { Origin: origin },
    data: { birthYear: 2000, gender: "male" },
  });
  expect(mealProfile.status()).toBe(200);

  await page.request.post("/api/workbench/auth/sign-out", {
    headers: { Origin: origin },
  });
  const login = await page.request.post("/api/workbench/auth/sign-in", {
    headers: { Origin: origin },
    data: { loginId, pin },
  });
  expect(login.status()).toBe(200);

  const profile = await page.request.patch("/what-should-eat/api/auth/me", {
    headers: { Origin: origin },
    data: { displayName: "E2E 새 이름" },
  });
  expect(profile.status()).toBe(200);
  const profileBody = (await profile.json()) as {
    user: { displayName: string };
  };
  expect(profileBody.user.displayName).toBe("E2E 새 이름");

  const decision = await page.request.post("/what-should-eat/api/decisions", {
    headers: { Origin: origin },
    data: {
      participantIds: [signupBody.account.id],
      place,
      comparisons: [],
    },
  });
  expect(decision.status()).toBe(201);
  const decisionBody = (await decision.json()) as { decision: { id: number } };

  const feedback = await page.request.post("/what-should-eat/api/feedback", {
    headers: { Origin: origin },
    data: {
      decisionId: decisionBody.decision.id,
      response: "liked",
    },
  });
  expect(feedback.status()).toBe(201);

  const decisions = await page.request.get("/what-should-eat/api/decisions");
  expect(decisions.status()).toBe(200);
  const decisionsBody = (await decisions.json()) as { decisions: unknown[] };
  expect(decisionsBody.decisions).toHaveLength(1);

  const search = await page.request.get(
    "/what-should-eat/api/places/search?q=테스트",
  );
  expect(search.status()).toBe(
    process.env.WORKBENCH_KAKAO_E2E === "true" ? 200 : 502,
  );
});
