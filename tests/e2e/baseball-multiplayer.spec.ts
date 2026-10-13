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
    .getByRole("button", { name: "게임 모드 변경, 현재 AI 대전 홈팀" })
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
  await expect(host.locator(".bbg-card-effect")).toHaveCount(4);
  await expect(host.locator(".bbg-card-timing")).toHaveCount(4);
  await expect(host.locator(".bbg-card-effect").first()).toBeVisible();
  await expect(host.getByLabel("이닝별 점수와 경기 기록")).toBeVisible();
  await expect(host.getByLabel("투구 위치")).toBeVisible();
  await expect(
    host.getByRole("button", { name: "경기 음향 끄기" }),
  ).toBeVisible();

  await host.setViewportSize({ width: 944, height: 1013 });
  const portraitField = await host.evaluate(() => {
    const stadium = document.querySelector(
      ".bbg-room-stage .bbg-field-overview",
    );
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
  await expect(home.locator(".bbg-card-effect")).toHaveCount(4);
  await expect(home.locator(".bbg-card-timing")).toHaveCount(4);
  await expect(home.locator(".bbg-card-effect").first()).toBeVisible();
  await expect(home.getByRole("region", { name: "투구 선택" })).toBeVisible();
  // v4: the batter decides at the same time as the pitcher.
  await expect(host.getByRole("region", { name: "타격 선택" })).toBeVisible({
    timeout: 4_000,
  });
  await expect(host.getByText("스윙할지 정하세요")).toBeVisible();

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
          command: { type: "SELECT_PITCH", target: "strike" },
          expectedRevision: 0,
          idempotencyKey,
        }),
      });
      return { status: response.status, payload: await response.json() };
    };
    return { keys, results: await Promise.all(keys.map(send)) };
  }, roomCode);
  // The second lock replays on the fresh state and finds the pitch taken.
  expect(race.results.map((result) => result.status).sort()).toEqual([
    200, 403,
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
          command: { type: "SELECT_PITCH", target: "strike" },
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
  const syncStartedAt = Date.now();
  await expect
    .poll(async () => {
      const payload = await host.evaluate(async (code) => {
        const response = await fetch(`/api/baseball-game/rooms/${code}/view`);
        return response.json();
      }, roomCode);
      return payload.snapshot.view.revision;
    })
    .toBe(1);
  expect(Date.now() - syncStartedAt).toBeLessThan(1_800);
  await expect(host.getByText(/상대는 이미 골랐습니다/)).toBeVisible();

  const lockedViews = await Promise.all([
    host.evaluate(
      async (code) =>
        (await fetch(`/api/baseball-game/rooms/${code}/view`)).json(),
      roomCode,
    ),
    home.evaluate(
      async (code) =>
        (await fetch(`/api/baseball-game/rooms/${code}/view`)).json(),
      roomCode,
    ),
  ]);
  expect(lockedViews[0].snapshot.view.pitchDuel.pitcherChoice).toBeNull();
  expect(lockedViews[0].snapshot.view.pitchDuel.actualLocation).toBeNull();
  expect(lockedViews[1].snapshot.view.pitchDuel.pitcherChoice).toBe("strike");
  expect(lockedViews[1].snapshot.view.pitchDuel.actualLocation).toBeNull();
  await expect(
    host.getByRole("region", { name: "이번 승부 선택 기록" }),
  ).toHaveCount(0);
  await expect(
    home.getByRole("region", { name: "이번 승부 선택 기록" }),
  ).toHaveCount(0);

  await expect(host.getByRole("region", { name: "타격 선택" })).toBeVisible();
  await host.getByRole("button", { name: /지켜보기/ }).click();
  await expect(
    host.locator(".bbg-pitch-marker[data-current='true']"),
  ).toBeVisible();
  await expect(
    host.getByRole("list", { name: "현재 타자 누적 투구" }),
  ).toBeVisible();
  await expect(host.getByLabel("현재 승부 진행 기록")).toContainText(
    "투수스트라이크타자지켜보기",
  );

  const directFace = await home.evaluate(async (code) => {
    const response = await fetch(`/api/baseball-game/rooms/${code}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        command: { type: "PITCH_RESULT", face: "HR" },
        expectedRevision: 2,
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
      .querySelector(".bbg-room-board")
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

test("상대 기기의 응원과 접속 상태가 실시간으로 보인다", async ({
  browser,
}) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const hostContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const homeContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const host = await hostContext.newPage();
  const home = await homeContext.newPage();

  await host.goto(`${baseURL}/baseball-game`);
  const created = await host.evaluate(async () => {
    const response = await fetch("/api/baseball-game/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "multiplayer",
        config: { innings: 3, awayTeamName: "블루", homeTeamName: "레드" },
      }),
    });
    return response.json();
  });
  await host.goto(`${baseURL}${created.roomUrl}`);
  await expect(host.getByAltText("홈팀 참가 QR 코드")).toBeVisible();

  await home.goto(`${baseURL}${created.roomUrl}`);
  await home.getByRole("button", { name: "홈팀으로 참가" }).click();
  await expect(home.getByRole("region", { name: "투구 선택" })).toBeVisible();

  await expect(host.getByText("스윙할지 정하세요")).toBeVisible();
  await expect(host.getByText(/접속 중/)).toBeVisible();
  await expect(
    host.getByRole("timer", { name: /내 결정 남은 시간/ }),
  ).toBeVisible();

  await home.getByRole("button", { name: "한 번 더 와봐" }).click();
  await expect(
    host.locator(".bbg-room-bubbles [data-side='opponent']"),
  ).toContainText("한 번 더 와봐", { timeout: 4_000 });

  await home.close();
  await expect(host.getByText("상대 연결 끊김")).toBeVisible({
    timeout: 25_000,
  });

  await hostContext.close();
  await homeContext.close();
});
