import { expect, test } from "@playwright/test";

test("공용 화면과 두 개인기기가 손패를 분리한 채 같은 경기를 진행한다", async ({
  browser,
}) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const displayContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const awayContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const homeContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const display = await displayContext.newPage();
  const away = await awayContext.newPage();
  const home = await homeContext.newPage();

  await display.route("**/api/workbench/auth/me", (route) =>
    route.fulfill({ status: 200, json: { account: null } }),
  );
  await display.goto(`${baseURL}/baseball-game`);
  await display
    .getByRole("button", { name: "게임 모드 변경, 현재 로컬 2인" })
    .click();
  await display.getByLabel("게임 모드", { exact: true }).selectOption("party");
  await display.getByRole("button", { name: "파티플레이 경기 만들기" }).click();
  await expect(display).toHaveURL(/\/baseball-game\/party\/[A-Z2-9]{6}$/);

  const roomCode = display.url().split("/").at(-1)!;
  await expect(
    display.getByRole("region", { name: "개인 화면 연결" }),
  ).toBeVisible();
  await expect(
    display.getByRole("region", { name: "공용 경기 점수판 1회초" }),
  ).toBeVisible();
  await expect(display.getByText("개인기기 연결 대기")).toBeVisible();

  const controllerLinks = await display.evaluate((code) => {
    const stored = sessionStorage.getItem(`baseball-party:${code}:invites`);
    return stored
      ? (JSON.parse(stored) as {
          awayControllerUrl: string;
          homeControllerUrl: string;
        })
      : null;
  }, roomCode);
  expect(controllerLinks).not.toBeNull();

  const publicPayload = await display.evaluate(async (code) => {
    const response = await fetch(
      `/api/baseball-game/rooms/${code}/public-view`,
    );
    return response.json();
  }, roomCode);
  expect(publicPayload.snapshot.view.cards.offense.hand).toBeNull();
  expect(publicPayload.snapshot.view.cards.defense.hand).toBeNull();
  expect(publicPayload.snapshot.view).not.toHaveProperty("rng");
  expect(JSON.stringify(publicPayload)).not.toContain("token");

  await away.goto(
    new URL(controllerLinks!.awayControllerUrl, baseURL).toString(),
  );
  await expect(away).toHaveURL(new RegExp(`/baseball-game/rooms/${roomCode}$`));
  await expect(
    away.getByRole("region", { name: "원정팀 공격 손패" }),
  ).toBeVisible();

  await home.goto(
    new URL(controllerLinks!.homeControllerUrl, baseURL).toString(),
  );
  await expect(home).toHaveURL(new RegExp(`/baseball-game/rooms/${roomCode}$`));
  await expect(
    home.getByRole("region", { name: "홈팀 수비 손패" }),
  ).toBeVisible();
  await expect(
    home.getByRole("button", { name: "투구 주사위 굴리기" }),
  ).toBeVisible();
  await expect(display.getByText("경기 진행 중")).toBeVisible({
    timeout: 4_000,
  });

  await home.getByRole("button", { name: "투구 주사위 굴리기" }).click();
  await expect
    .poll(async () => {
      const payload = await display.evaluate(async (code) => {
        const response = await fetch(
          `/api/baseball-game/rooms/${code}/public-view`,
        );
        return response.json();
      }, roomCode);
      return payload.snapshot.view.revision;
    })
    .toBe(1);
  await expect(display.getByText("REV 1")).toBeVisible({ timeout: 4_000 });

  const layouts = await Promise.all(
    [display, away, home].map((page) =>
      page.evaluate(() => ({
        widthFits: document.documentElement.scrollWidth <= window.innerWidth,
        heightFits: document.documentElement.scrollHeight <= window.innerHeight,
      })),
    ),
  );
  for (const layout of layouts) {
    expect(layout.widthFits).toBe(true);
    expect(layout.heightFits).toBe(true);
  }

  await displayContext.close();
  await awayContext.close();
  await homeContext.close();
});
