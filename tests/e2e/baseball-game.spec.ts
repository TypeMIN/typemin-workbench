import { expect, test, type Page } from "@playwright/test";

async function passCardWindows(page: Page) {
  for (let step = 0; step < 8; step += 1) {
    const pass = page.getByRole("button", { name: "카드 없이 진행" });
    if (!(await pass.isVisible().catch(() => false))) break;
    await pass.click();
  }
}

test("야구 게임에서 투타 심리전과 새 경기를 진행한다", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.route("**/api/workbench/auth/me", (route) =>
    route.fulfill({ status: 200, json: { account: null } }),
  );

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/baseball-game");

  await expect(
    page.getByRole("heading", { name: "야구 게임 라이브" }),
  ).toBeVisible();
  await expect(page.getByText("PITCH-DUEL-V2 · SOLO AI")).toBeVisible();
  await expect(page.getByText("AI 대전 · 홈팀")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: /기기를 넘겨주세요/ }),
  ).toHaveCount(0);
  await expect(page.getByLabel("현재 진행 단계 투구")).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: /경기 점수판, 1회초, 무사, 주자 없음/,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("이닝별 점수와 경기 기록")).toContainText(
    "RHEB",
  );
  await expect(page.getByLabel("투구 위치")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "경기 음향 끄기" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "투구 코스 선택" }),
  ).toBeVisible();
  await expect(page.locator(".bbg-d12")).toHaveCount(0);
  await expect(page.locator(".bbg-pitch-choice")).toHaveCount(5);
  await expect(
    page.getByRole("button", { name: "높은 몸쪽 선택" }),
  ).toContainText("컨택 68%");
  await expect(
    page.getByRole("button", { name: "높은 몸쪽 선택" }),
  ).toContainText("안타 25");
  await expect(
    page.getByRole("region", { name: "원정팀 공격 비공개 손패" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "홈팀 수비 손패" }),
  ).toBeVisible();
  await expect(page.locator(".bbg-card-hand button")).toHaveCount(4);
  await expect(page.locator(".bbg-card-back")).toHaveCount(4);
  await expect(page.locator(".bbg-card-hand button[data-tier]")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "카드 없이 진행" }),
  ).toHaveCount(0);
  await expect(page.locator(".bbg-team-score.is-batting")).toContainText(
    "원정팀",
  );
  await expect(page.locator(".bbg-fence")).toBeVisible();
  await expect(page.locator(".bbg-fielders")).toHaveCount(0);
  await expect(page.locator(".bbg-distance-marks")).toHaveCount(0);
  await expect(page.locator(".bbg-stadium svg")).toHaveAttribute(
    "preserveAspectRatio",
    "xMidYMid meet",
  );
  await expect(page.locator(".bbg-stadium svg")).toHaveAttribute(
    "viewBox",
    "0 0 900 700",
  );
  await expect(page.getByRole("img", { name: /주자 없음/ })).toBeVisible();
  await expect(
    page.locator('.bbg-count-line[data-tone="ball"] .bbg-count-lights i'),
  ).toHaveCount(3);
  await expect(
    page.locator('.bbg-count-line[data-tone="strike"] .bbg-count-lights i'),
  ).toHaveCount(2);
  await expect(
    page.locator('.bbg-count-line[data-tone="out"] .bbg-count-lights i'),
  ).toHaveCount(2);
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);

  const baseLayout = await page.locator(".bbg-diamond").evaluate((diamond) => {
    const center = (selector: string) => {
      const rect = diamond.querySelector(selector)?.getBoundingClientRect();
      if (!rect) throw new Error(`${selector} 위치를 찾지 못했습니다.`);
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    };
    return {
      first: center(".bbg-field-base--first"),
      second: center(".bbg-field-base--second"),
      third: center(".bbg-field-base--third"),
      home: center(".bbg-field-home"),
    };
  });
  expect(baseLayout.second.y).toBeLessThan(baseLayout.first.y);
  expect(baseLayout.home.y).toBeGreaterThan(baseLayout.first.y);
  expect(baseLayout.first.x).toBeGreaterThan(baseLayout.second.x);
  expect(baseLayout.third.x).toBeLessThan(baseLayout.second.x);
  expect(Math.abs(baseLayout.first.y - baseLayout.third.y)).toBeLessThan(4);

  const broadcastFit = await page.evaluate(() => {
    const bounds = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`${selector} 영역을 찾지 못했습니다.`);
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        height: rect.height,
        width: rect.width,
      };
    };
    return {
      viewportBottom: window.innerHeight,
      console: bounds(".bbg-game-console"),
      heading: bounds(".bbg-broadcast-heading"),
      scoreboard: bounds(".bbg-scoreboard"),
      scoreTeams: bounds(".bbg-score-teams"),
      scoreStatus: bounds(".bbg-score-status"),
      field: bounds(".bbg-field-content"),
      result: bounds(".bbg-play-result"),
      resultCopy: bounds(".bbg-result-copy"),
      resultSide: bounds(".bbg-result-side"),
    };
  });
  expect(broadcastFit.console.bottom).toBeLessThanOrEqual(
    broadcastFit.viewportBottom,
  );
  expect(broadcastFit.heading.top).toBeGreaterThanOrEqual(
    broadcastFit.field.top - 1,
  );
  expect(broadcastFit.scoreTeams.bottom).toBeLessThanOrEqual(
    broadcastFit.field.top + 70,
  );
  expect(broadcastFit.scoreStatus.bottom).toBeLessThanOrEqual(
    broadcastFit.field.top + 70,
  );
  expect(broadcastFit.scoreTeams.right).toBeLessThanOrEqual(
    broadcastFit.scoreStatus.left + 1,
  );
  expect(broadcastFit.scoreTeams.width).toBeGreaterThan(300);
  expect(broadcastFit.scoreStatus.width).toBeLessThanOrEqual(210);
  expect(broadcastFit.resultCopy.bottom).toBeLessThanOrEqual(
    broadcastFit.result.bottom + 1,
  );
  expect(broadcastFit.resultSide.bottom).toBeLessThanOrEqual(
    broadcastFit.result.bottom + 1,
  );
  const scoreRows = await page.locator(".bbg-team-score").evaluateAll((rows) =>
    rows.map((row) => {
      const rect = row.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    }),
  );
  expect(scoreRows[1].top).toBeGreaterThanOrEqual(scoreRows[0].bottom - 1);

  await page.getByRole("button", { name: "볼 선택" }).click();
  await expect(page.getByText("원정팀 판단 중")).toBeVisible();
  await expect(page.getByTestId("play-result")).toContainText("타자", {
    timeout: 3_000,
  });
  await passCardWindows(page);
  await expect(
    page.locator(".bbg-pitch-marker[data-current='true']"),
  ).toHaveText("1");
  await expect(page.getByTestId("play-result")).toContainText("투수 볼");
  await expect(page.getByTestId("play-result")).toContainText("승부 성공");
  await expect(page.getByText("특정 면 강제 입력")).toHaveCount(0);

  await page
    .getByRole("button", { name: "게임 모드 변경, 현재 AI 대전 홈팀" })
    .click();
  await page.getByRole("textbox", { name: "원정팀" }).fill("블루");
  await page.getByRole("textbox", { name: "홈팀" }).fill("레드");
  await page.getByLabel("경기 길이").selectOption("5");
  await page.getByRole("button", { name: /새 경기 시작/ }).click();
  await expect(page.locator(".bbg-scoreboard")).toHaveAttribute(
    "data-scheduled-innings",
    "5",
  );

  await page.setViewportSize({ width: 1280, height: 720 });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= window.innerWidth &&
        document.documentElement.scrollHeight <= window.innerHeight,
    ),
  ).toBe(true);
  await expect(page.locator(".bbg-game-progress")).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "현재 판정" })).toBeVisible();
  await expect(page.locator(".bbg-card-hand button")).toHaveCount(4);
  await expect(page.locator(".bbg-card-back")).toHaveCount(4);
  await expect(page.locator(".bbg-game-progress")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const cardsFit = await page.locator(".bbg-card-hands").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const consoleRect = element
      .closest(".bbg-game-console")
      ?.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      consoleBottom: consoleRect?.bottom ?? 0,
      viewportBottom: window.innerHeight,
    };
  });
  expect(cardsFit.bottom).toBeLessThanOrEqual(cardsFit.consoleBottom + 1);
  expect(cardsFit.bottom).toBeLessThanOrEqual(cardsFit.viewportBottom);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight,
    ),
  ).toBe(true);
  expect(browserErrors).toEqual([]);
});

test("싱글플레이에서 AI가 타격 판단을 이어서 진행한다", async ({ page }) => {
  await page.route("**/api/workbench/auth/me", (route) =>
    route.fulfill({ status: 200, json: { account: null } }),
  );
  await page.goto("/baseball-game");
  await page.getByRole("button", { name: /^낮은 바깥쪽/ }).click();
  await expect(page.getByText("원정팀 판단 중")).toBeVisible();
  await expect(page.getByTestId("play-result")).toContainText("타자", {
    timeout: 3_000,
  });
  await expect(page.locator(".bbg-log-panel summary strong")).not.toHaveText(
    "0",
  );
  await expect(page.locator(".bbg-d12")).toHaveCount(0);
});

test("새 경기 설정은 싱글 AI·멀티·파티 모드만 제공한다", async ({ page }) => {
  await page.route("**/api/workbench/auth/me", (route) =>
    route.fulfill({ status: 200, json: { account: null } }),
  );
  await page.goto("/baseball-game");

  await page.getByText("새 경기 설정", { exact: true }).click();
  await expect(page.getByLabel("게임 모드", { exact: true })).toHaveValue(
    "solo_ai",
  );
  await expect(
    page.getByLabel("게임 모드", { exact: true }).locator("option"),
  ).toHaveCount(3);
  await expect(page.getByRole("option", { name: /로컬 2인/ })).toHaveCount(0);
  await expect(page.getByLabel("내 팀")).toBeVisible();
  await page.getByLabel("내 팀").selectOption("home");
  await page.getByRole("button", { name: /새 경기 시작/ }).click();

  await expect(page.getByText("PITCH-DUEL-V2 · SOLO AI")).toBeVisible();
  await expect(page.getByText("AI 대전 · 홈팀")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "홈팀 수비 손패" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "원정팀 공격 비공개 손패" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "투구 코스 선택" }),
  ).toBeVisible();

  await page.getByText("새 경기 설정", { exact: true }).click();
  await page.getByLabel("게임 모드", { exact: true }).selectOption("solo_ai");
  await page.getByLabel("내 팀").selectOption("away");
  await page.getByRole("button", { name: /새 경기 시작/ }).click();
  await expect(page.getByRole("status")).toContainText("홈팀 판단 중");
  await expect(page.getByRole("img", { name: /예상 투구 위치/ })).toBeVisible({
    timeout: 3_000,
  });
  await expect(page.locator(".bbg-d12")).toHaveCount(0);
  await expect(page.locator(".bbg-log-panel summary strong")).not.toHaveText(
    "0",
    { timeout: 3_000 },
  );
});

test("주요 데스크톱·태블릿·모바일 화면비율에서 게임 UI가 잘리지 않는다", async ({
  page,
}) => {
  await page.route("**/api/workbench/auth/me", (route) =>
    route.fulfill({ status: 200, json: { account: null } }),
  );
  await page.goto("/baseball-game");
  await page.getByText("새 경기 설정", { exact: true }).click();
  await page.getByLabel("경기 길이").selectOption("9");
  await page.getByRole("button", { name: /새 경기 시작/ }).click();

  const viewports = [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 820, height: 1180 },
    { width: 1024, height: 600 },
    { width: 1024, height: 768 },
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".bbg-game-console")).toBeVisible();
    await expect(page.locator(".bbg-card-hands")).toBeVisible();

    const layout = await page.evaluate(() => {
      const bounds = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`${selector} 영역을 찾지 못했습니다.`);
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      };
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        document: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        },
        console: bounds(".bbg-game-console"),
        scoreboard: bounds(".bbg-scoreboard"),
        controls: bounds(".bbg-control-panel"),
        hands: bounds(".bbg-card-hands"),
        lineScoreFits: (() => {
          const lineScore = document.querySelector(".bbg-line-score-grid");
          return lineScore
            ? lineScore.scrollWidth <= lineScore.clientWidth + 1
            : false;
        })(),
        inningColumns: [
          ...document.querySelectorAll(".bbg-line-score-head.bbg-line-inning"),
        ].filter((element) => getComputedStyle(element).display !== "none")
          .length,
        totalHeaders: [
          ...document.querySelectorAll(".bbg-line-score-head.bbg-line-total"),
        ]
          .filter((element) => getComputedStyle(element).display !== "none")
          .map((element) => element.textContent),
      };
    });
    expect(layout.document.width, JSON.stringify(viewport)).toBeLessThanOrEqual(
      layout.viewport.width,
    );
    expect(
      layout.document.height,
      JSON.stringify(viewport),
    ).toBeLessThanOrEqual(layout.viewport.height);
    expect(layout.totalHeaders).toEqual(["R", "H", "E", "B"]);
    expect(layout.lineScoreFits, JSON.stringify(viewport)).toBe(true);
    expect(layout.inningColumns > 0).toBe(viewport.width > 639);
    for (const [name, region] of [
      ["console", layout.console],
      ["scoreboard", layout.scoreboard],
      ["controls", layout.controls],
      ["hands", layout.hands],
    ] as const) {
      const context = `${name} ${JSON.stringify(viewport)}`;
      expect(region.left, context).toBeGreaterThanOrEqual(-1);
      expect(region.right, context).toBeLessThanOrEqual(
        layout.viewport.width + 1,
      );
      expect(region.bottom, context).toBeLessThanOrEqual(
        layout.viewport.height + 1,
      );
      expect(region.width, context).toBeGreaterThan(0);
      expect(region.height, context).toBeGreaterThan(0);
    }
  }
});
