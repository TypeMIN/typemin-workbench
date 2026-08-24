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

test("로그인 화면이 열리고 가입 항목에는 제외조건이 없다", async ({ page }) => {
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
  await page.getByRole("tab", { name: "처음이에요" }).click();
  await expect(page.getByLabel("출생연도")).toBeVisible();
  await expect(page.getByLabel("출생연도")).toHaveJSProperty(
    "tagName",
    "SELECT",
  );
  await expect(page.getByRole("radio", { name: "남성" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "여성" })).toBeVisible();
  await expect(page.getByRole("button", { name: "중복확인" })).toBeVisible();
  await expect(page.getByLabel("PIN")).toHaveAttribute("maxlength", "6");
  await expect(page.getByText(/못 먹는 음식/)).toHaveCount(0);
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
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "로그인이 필요합니다." }),
    }),
  );
  await page.route("**/what-should-eat/api/auth/login", (route) =>
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
  await page.getByLabel("ID").fill("hostuser");
  await page.getByLabel("PIN").fill("1234");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
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
