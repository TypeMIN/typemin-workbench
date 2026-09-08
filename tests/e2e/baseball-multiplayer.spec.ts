import { expect, test } from "@playwright/test";

test("두 기기가 방을 만들고 비공개 손패로 같은 경기를 진행한다", async ({
  browser,
}) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const hostContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const homeContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const outsiderContext = await browser.newContext();
  const host = await hostContext.newPage();
  const home = await homeContext.newPage();

  await host.route("**/api/workbench/auth/me", (route) =>
    route.fulfill({ status: 200, json: { account: null } }),
  );
  await host.goto(`${baseURL}/baseball-game`);
  await host
    .getByRole("button", { name: "게임 모드 변경, 현재 로컬 2인" })
    .click();
  await host
    .getByLabel("게임 모드", { exact: true })
    .selectOption("multiplayer");
  await expect(host.getByLabel("참가할 방 코드")).toBeVisible();
  await host.getByRole("button", { name: "멀티플레이 방 만들기" }).click();
  await expect(host).toHaveURL(/\/baseball-game\/rooms\/[A-Z2-9]{6}$/);

  const roomUrl = host.url();
  const roomCode = roomUrl.split("/").at(-1)!;
  await expect(host.getByText("홈팀 참가 대기 중")).toBeVisible();
  await expect(host.getByLabel(`방 코드 ${roomCode}`)).toBeVisible();
  await expect(
    host.getByRole("region", { name: "원정팀 공격 손패" }),
  ).toBeVisible();
  await expect(host.getByLabel("이닝별 점수와 경기 기록")).toBeVisible();
  await expect(host.getByLabel("투구 위치")).toBeVisible();
  await expect(
    host.getByRole("button", { name: "경기 음향 끄기" }),
  ).toBeVisible();

  await host.setViewportSize({ width: 944, height: 1013 });
  const portraitField = await host.evaluate(() => {
    const stadium = document.querySelector(".bbg-mp-field .bbg-stadium svg");
    return {
      pageWidthFits: document.documentElement.scrollWidth <= window.innerWidth,
      pageHeightFits:
        document.documentElement.scrollHeight <= window.innerHeight,
      usesBroadcastStadium:
        stadium?.getAttribute("viewBox") === "0 0 900 700" &&
        stadium?.getAttribute("preserveAspectRatio") === "xMidYMid meet",
    };
  });
  expect(portraitField.pageWidthFits).toBe(true);
  expect(portraitField.pageHeightFits).toBe(true);
  expect(portraitField.usesBroadcastStadium).toBe(true);
  await host.setViewportSize({ width: 1280, height: 720 });

  const outsider = await outsiderContext.newPage();
  const outsiderResponse = await outsider.request.get(
    `${baseURL}/api/baseball-game/rooms/${roomCode}/view`,
  );
  expect(outsiderResponse.status()).toBe(401);
  expect(await outsiderResponse.json()).not.toHaveProperty("snapshot");

  await home.goto(roomUrl);
  await expect(
    home.getByRole("heading", { name: "홈팀으로 참가할까요?" }),
  ).toBeVisible();
  await home.getByRole("button", { name: "홈팀으로 참가" }).click();
  await expect(
    home.getByRole("region", { name: "홈팀 수비 손패" }),
  ).toBeVisible();
  await expect(
    home.getByRole("button", { name: "투구 주사위 굴리기" }),
  ).toBeVisible();
  await expect(host.getByText("상대 팀의 결정을 기다리는 중")).toBeVisible({
    timeout: 4_000,
  });

  const privateViews = await Promise.all([
    host.evaluate(async (code) => {
      const response = await fetch(`/api/baseball-game/rooms/${code}/view`);
      return response.json();
    }, roomCode),
    home.evaluate(async (code) => {
      const response = await fetch(`/api/baseball-game/rooms/${code}/view`);
      return response.json();
    }, roomCode),
  ]);
  expect(privateViews[0].snapshot.view.cards.offense.hand).toHaveLength(4);
  expect(privateViews[0].snapshot.view.cards.defense.hand).toBeNull();
  expect(privateViews[1].snapshot.view.cards.offense.hand).toBeNull();
  expect(privateViews[1].snapshot.view.cards.defense.hand).toHaveLength(4);
  expect(JSON.stringify(privateViews)).not.toContain('"rng"');

  const race = await home.evaluate(async (code) => {
    const keys = [crypto.randomUUID(), crypto.randomUUID()];
    const send = async (idempotencyKey: string) => {
      const response = await fetch(`/api/baseball-game/rooms/${code}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          command: { type: "ROLL_DIE" },
          expectedRevision: 0,
          idempotencyKey,
        }),
      });
      return { status: response.status, payload: await response.json() };
    };
    return { keys, results: await Promise.all(keys.map(send)) };
  }, roomCode);
  expect(race.results.map((result) => result.status).sort()).toEqual([
    200, 409,
  ]);
  const appliedIndex = race.results.findIndex(
    (result) => result.status === 200,
  );
  expect(race.results[appliedIndex].payload.snapshot.view.revision).toBe(1);

  const retry = await home.evaluate(
    async ({ code, idempotencyKey }) => {
      const response = await fetch(`/api/baseball-game/rooms/${code}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          command: { type: "ROLL_DIE" },
          expectedRevision: 0,
          idempotencyKey,
        }),
      });
      return { status: response.status, payload: await response.json() };
    },
    { code: roomCode, idempotencyKey: race.keys[appliedIndex] },
  );
  expect(retry.status).toBe(200);
  expect(retry.payload.snapshot.view.revision).toBe(1);
  await expect(
    home.locator(".bbg-pitch-marker[data-current='true']"),
  ).toBeVisible();

  await expect
    .poll(async () => {
      const payload = await host.evaluate(async (code) => {
        const response = await fetch(`/api/baseball-game/rooms/${code}/view`);
        return response.json();
      }, roomCode);
      return payload.snapshot.view.revision;
    })
    .toBe(1);

  const directFace = await home.evaluate(async (code) => {
    const response = await fetch(`/api/baseball-game/rooms/${code}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        command: { type: "PITCH_RESULT", face: "HR" },
        expectedRevision: 1,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    return response.status;
  }, roomCode);
  expect(directFace).toBe(400);

  const mobileLayout = await home.evaluate(() => ({
    widthFits: document.documentElement.scrollWidth <= window.innerWidth,
    heightFits: document.documentElement.scrollHeight <= window.innerHeight,
    board: document
      .querySelector(".bbg-mp-board")
      ?.getBoundingClientRect()
      .toJSON(),
  }));
  expect(mobileLayout.widthFits).toBe(true);
  expect(mobileLayout.heightFits).toBe(true);
  expect(mobileLayout.board.bottom).toBeLessThanOrEqual(845);

  await hostContext.close();
  await homeContext.close();
  await outsiderContext.close();
});
