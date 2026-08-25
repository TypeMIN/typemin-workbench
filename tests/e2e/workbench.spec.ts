import { expect, test } from "@playwright/test";
import { WORKBENCH_APPS } from "@/lib/workbench/apps";

test("홈에서 두 앱으로 이동한다", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Workbench" })).toBeVisible();
  await expect(page.getByText("1개 운영 · 1개 완료")).toBeVisible();
  await expect(
    page
      .getByRole("link", { name: "월드컵 예측 내기 열기" })
      .getByText("아카이브", { exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "오늘 뭐 먹지? 열기" }).click();
  await expect(page).toHaveURL(/\/what-should-eat$/);
  await expect(
    page.getByRole("link", { name: "Workbench 홈으로 돌아가기" }),
  ).toHaveAttribute("href", "/");

  await page.goto("/");
  await page.getByRole("link", { name: "월드컵 예측 내기 열기" }).click();
  await expect(page).toHaveURL(/\/worldcup-prediction$/);
  await expect(
    page.getByRole("link", { name: "Workbench 홈으로 돌아가기" }),
  ).toHaveAttribute("href", "/");
  await expect(
    page.getByRole("heading", { name: "읽기 전용 아카이브" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "참가 / 로그인" })).toHaveCount(
    0,
  );
});

for (const app of WORKBENCH_APPS) {
  test(`${app.name}에서 Workbench로 돌아간다`, async ({ page }) => {
    await page.goto(app.href);
    const homeLink = page
      .getByRole("link", { name: "Workbench 홈으로 돌아가기" })
      .first();
    await expect(homeLink).toHaveAttribute("href", "/");
  });
}
