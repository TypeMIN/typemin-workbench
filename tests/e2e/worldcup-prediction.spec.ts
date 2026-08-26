import { expect, test } from "@playwright/test";

test("완료된 월드컵 기록을 읽기 전용으로 공개한다", async ({ page }) => {
  await page.goto("/worldcup-prediction");
  await expect(
    page.getByRole("heading", { name: "월드컵 예측 내기" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "읽기 전용 아카이브" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "점수판" })).toBeVisible();
  await expect(page.getByRole("region", { name: "예측" })).toBeVisible();
  await expect(page.getByLabel("이름")).toHaveCount(0);
  await expect(page.getByLabel("PIN")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "참가 / 로그인" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "경기 정보 동기화" }),
  ).toHaveCount(0);
});

test("공통 계정 상태만 제공한다", async ({ page }) => {
  await page.goto("/worldcup-prediction");
  await expect(
    page.getByRole("link", { name: "Workbench 홈으로 돌아가기" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Workbench 계정" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "다크 모드로 전환" }),
  ).toBeVisible();
});
