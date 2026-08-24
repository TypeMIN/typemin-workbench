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

test("관리자 PIN으로 로그인하면 비활성 동기화 상태를 보여준다", async ({
  page,
}) => {
  await page.goto("/worldcup-prediction");
  await page.getByLabel("이름").fill("관리자");
  await page.getByLabel("PIN").fill("0000");
  await page.getByRole("button", { name: "참가 / 로그인" }).click();

  await expect(page.getByRole("status")).toContainText(
    "관리자로 로그인했습니다.",
  );
  await expect(
    page.getByRole("button", { name: "경기 정보 동기화" }),
  ).toBeDisabled();
  await expect(
    page.getByText("자동 동기화가 비활성화되어 있습니다.", { exact: false }),
  ).toBeVisible();
});
