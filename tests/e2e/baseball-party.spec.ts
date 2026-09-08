import { expect, test, type BrowserContext, type Page } from "@playwright/test";

test("공용 화면과 2대2 개인기기가 한 파티 경기를 실제로 진행한다", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const contexts: BrowserContext[] = [];
  const displayContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  contexts.push(displayContext);
  const display = await displayContext.newPage();
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
  await expect(display.getByAltText("파티플레이 참가 QR 코드")).toBeVisible();
  await expect(display.getByText("카메라 없이 참가")).toBeVisible();
  await expect(
    display.getByText(/파티플레이를 선택하고 방 코드/),
  ).toContainText(roomCode);

  const players: Page[] = [];
  const entries = [
    ["원정하나", "away"],
    ["원정둘", "away"],
    ["홈하나", "home"],
    ["홈둘", "home"],
  ] as const;
  for (const [index, [nickname, team]] of entries.entries()) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    contexts.push(context);
    const page = await context.newPage();
    if (index === 0) {
      await page.goto(`${baseURL}/baseball-game`);
      await page.getByText("새 경기 설정", { exact: true }).click();
      await page.getByLabel("게임 모드", { exact: true }).selectOption("party");
      await page.getByLabel("참가할 방 코드").fill(roomCode);
      await page.getByRole("button", { name: "파티 방 참가하기" }).click();
      await expect(page).toHaveURL(new RegExp("/party/" + roomCode + "/join$"));
    } else {
      await page.goto(`${baseURL}/baseball-game/party/${roomCode}/join`);
    }
    await page.getByLabel("닉네임").fill(nickname);
    if (team === "home")
      await page.getByRole("button", { name: /홈 홈팀/ }).click();
    await page.getByRole("button", { name: "이 팀으로 참가" }).click();
    await expect(page).toHaveURL(new RegExp(`/party/${roomCode}/play$`));
    players.push(page);
  }

  await expect(
    display.getByRole("region", { name: "원정팀 참가자" }).getByText("2/8"),
  ).toBeVisible();
  await expect(
    display.getByRole("region", { name: "홈팀 참가자" }).getByText("2/8"),
  ).toBeVisible();
  await display.getByRole("button", { name: "경기 시작" }).click();
  await expect(
    display.getByRole("region", { name: "파티플레이 공용 경기장" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(display.getByLabel("이닝별 점수와 경기 기록")).toBeVisible();
  await expect(display.getByLabel("투구 위치")).toBeVisible();
  await expect(
    display.getByRole("button", { name: "경기 음향 끄기" }),
  ).toBeVisible();
  for (const page of players) {
    await expect(page.getByLabel("이닝별 점수와 경기 기록")).toBeVisible();
    await expect(page.getByRole("button", { name: /경기 음향/ })).toHaveCount(
      0,
    );
  }

  let activePage: Page | null = null;
  await expect
    .poll(async () => {
      for (const page of players.slice(2)) {
        if (
          await page
            .getByRole("button", { name: "주사위 굴리기" })
            .isVisible()
            .catch(() => false)
        ) {
          activePage = page;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  expect(activePage).not.toBeNull();

  await display.getByText("방장 운영", { exact: true }).click();
  await display.getByRole("button", { name: "일시정지" }).click();
  await expect(display.getByText("경기가 일시정지되었습니다")).toBeVisible();
  await expect
    .poll(async () =>
      activePage!
        .getByText("방장이 경기를 일시정지했습니다.")
        .isVisible()
        .catch(() => false),
    )
    .toBe(true);
  await display.getByRole("button", { name: "재개" }).click();
  await expect(display.getByText("경기가 일시정지되었습니다")).toBeHidden();

  const beforeSkip = await display.evaluate(
    async (code) =>
      (await fetch(`/api/baseball-game/rooms/${code}/public-view`)).json(),
    roomCode,
  );
  await display.getByRole("button", { name: "현재 선수 넘기기" }).click();
  await expect
    .poll(async () => {
      const payload = await display.evaluate(
        async (code) =>
          (await fetch(`/api/baseball-game/rooms/${code}/public-view`)).json(),
        roomCode,
      );
      return payload.snapshot.activeDefenderId;
    })
    .not.toBe(beforeSkip.snapshot.activeDefenderId);

  const afterSkip = await display.evaluate(
    async (code) =>
      (await fetch(`/api/baseball-game/rooms/${code}/public-view`)).json(),
    roomCode,
  );

  activePage = null;
  await expect
    .poll(async () => {
      for (const page of players.slice(2)) {
        const playerView = await page.evaluate(
          async (code) =>
            (await fetch(`/api/baseball-game/rooms/${code}/party/view`)).json(),
          roomCode,
        );
        if (
          playerView.snapshot?.me.id === afterSkip.snapshot.activeDefenderId &&
          playerView.snapshot?.canAct === true &&
          (await page
            .getByRole("button", { name: "주사위 굴리기" })
            .isVisible()
            .catch(() => false))
        ) {
          activePage = page;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  await activePage!.getByRole("button", { name: "주사위 굴리기" }).click();
  await expect
    .poll(async () => {
      const payload = await display.evaluate(
        async (code) =>
          (await fetch(`/api/baseball-game/rooms/${code}/public-view`)).json(),
        roomCode,
      );
      return payload.snapshot.view.revision;
    })
    .toBe(1);

  const publicPayload = await display.evaluate(
    async (code) =>
      (await fetch(`/api/baseball-game/rooms/${code}/public-view`)).json(),
    roomCode,
  );
  expect(publicPayload.snapshot.view.cards.offense.hand).toBeNull();
  expect(publicPayload.snapshot.view.cards.defense.hand).toBeNull();
  expect(publicPayload.snapshot.view).not.toHaveProperty("rng");
  expect(JSON.stringify(publicPayload)).not.toContain("token");
  const playerPayload = await players[0].evaluate(
    async (code) =>
      (await fetch(`/api/baseball-game/rooms/${code}/party/view`)).json(),
    roomCode,
  );
  expect(playerPayload.snapshot.view.cards.defense.hand).toBeNull();
  expect(playerPayload.snapshot.view).not.toHaveProperty("rng");

  const spectatorContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  contexts.push(spectatorContext);
  const spectator = await spectatorContext.newPage();
  await spectator.goto(`${baseURL}/baseball-game/party/${roomCode}/join`);
  await expect(
    spectator.getByRole("heading", { name: "경기가 시작되었습니다" }),
  ).toBeVisible();
  await spectator.getByRole("link", { name: "관전 화면 열기" }).click();
  await expect(
    spectator.getByRole("region", { name: "파티플레이 공용 경기장" }),
  ).toBeVisible();

  await display.setViewportSize({ width: 945, height: 1237 });
  const tallField = await display
    .getByRole("region", { name: "파티플레이 공용 경기장" })
    .boundingBox();
  const tallStadium = await display
    .locator(".bbg-party-live-field > .bbg-stadium")
    .boundingBox();
  expect(tallField).not.toBeNull();
  expect(tallStadium).not.toBeNull();
  expect(tallStadium!.height).toBeGreaterThan(tallField!.height * 0.7);

  for (const page of [display, ...players, spectator]) {
    const layout = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth <= window.innerWidth,
      height: document.documentElement.scrollHeight <= window.innerHeight,
    }));
    expect(layout.width).toBe(true);
    expect(layout.height).toBe(true);
  }
  await Promise.all(contexts.map((context) => context.close()));
});
