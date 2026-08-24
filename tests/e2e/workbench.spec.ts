import { expect, test } from "@playwright/test";

test("홈에서 두 앱으로 이동한다", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Workbench" })).toBeVisible();

  await page.getByRole("link", { name: "오늘 뭐 먹지? 열기" }).click();
  await expect(page).toHaveURL(/\/what-should-eat$/);

  await page.goto("/");
  await page.getByRole("link", { name: "월드컵 예측 내기 열기" }).click();
  await expect(page).toHaveURL(/\/worldcup-prediction$/);
});
