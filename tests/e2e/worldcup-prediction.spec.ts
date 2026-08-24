import { expect, test } from "@playwright/test";

test("참가자가 로그인하고 첫 경기 예측을 저장한다", async ({ page }) => {
  await page.goto("/worldcup-prediction");
  await expect(
    page.getByRole("heading", { name: "월드컵 예측 내기" }),
  ).toBeVisible();

  await page.getByLabel("이름").fill("민식");
  await page.getByLabel("PIN").fill("1234");
  await page.getByRole("button", { name: "참가 / 로그인" }).click();

  await expect(page.getByText("민식님으로 참가했습니다.")).toBeVisible();
  await page.getByLabel("32강 1경기").selectOption("A:win");
  await expect(page.getByRole("status")).toContainText("예측을 저장했습니다.");
});
