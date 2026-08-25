import { expect, test } from "@playwright/test";

test("홈에서 두 앱으로 이동한다", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Workbench" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "프로젝트" })).toBeVisible();
  await expect(
    page
      .getByRole("link", { name: "월드컵 예측 내기 열기" })
      .getByText("아카이브", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("TYPEMIN · PERSONAL LAB")).toHaveCount(0);
  await expect(
    page.getByText("작은 웹앱을 만들고 직접 사용하는 공간입니다."),
  ).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  const mealCard = await page
    .getByRole("link", { name: "오늘 뭐 먹지? 열기" })
    .boundingBox();
  const worldcupCard = await page
    .getByRole("link", { name: "월드컵 예측 내기 열기" })
    .boundingBox();
  expect(mealCard).not.toBeNull();
  expect(worldcupCard).not.toBeNull();
  expect(worldcupCard!.y).toBeGreaterThan(mealCard!.y);
  expect(mealCard!.height).toBeLessThanOrEqual(190);
  expect(worldcupCard!.height).toBeLessThanOrEqual(190);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.getByRole("link", { name: "오늘 뭐 먹지? 열기" }).click();
  await expect(page).toHaveURL(/\/what-should-eat$/);
  await expect(
    page.getByRole("link", { name: "Workbench 홈으로 돌아가기" }),
  ).toHaveCount(0);

  await page.goto("/");
  await page.getByRole("link", { name: "월드컵 예측 내기 열기" }).click();
  await expect(page).toHaveURL(/\/worldcup-prediction$/);
  await expect(
    page.getByRole("link", { name: "Workbench 홈으로 돌아가기" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "읽기 전용 아카이브" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "참가 / 로그인" })).toHaveCount(
    0,
  );
});

test("로그인 화면은 간결한 공통 계정 폼을 제공한다", async ({ page }) => {
  await page.goto("/account/sign-in?next=%2Fwhat-should-eat");

  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  await expect(page.getByLabel("ID")).toBeVisible();
  await expect(page.getByLabel("PIN")).toBeVisible();
  await expect(page.getByRole("button", { name: "로그인" })).toBeVisible();
  await expect(page.getByText("SHARED ACCOUNT")).toHaveCount(0);
  await expect(page.getByText(/모든 Workbench 앱/)).toHaveCount(0);
});
