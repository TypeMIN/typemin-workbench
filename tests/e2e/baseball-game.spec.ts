import { expect, test } from "@playwright/test";

test("야구 게임에서 강제 주사위 판정과 새 경기를 진행한다", async ({
  page,
}) => {
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
  await expect(
    page.getByRole("region", {
      name: /경기 점수판, 1회초, 무사, 주자 없음/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "투구 주사위 굴리기" }),
  ).toBeVisible();
  await expect(page.locator(".bbg-d12")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "원정팀 공격 손패" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "홈팀 수비 손패" }),
  ).toBeVisible();
  await expect(page.locator(".bbg-card-hand button")).toHaveCount(8);
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
  expect(broadcastFit.scoreTeams.right).toBeLessThan(
    broadcastFit.scoreStatus.left,
  );
  expect(broadcastFit.scoreTeams.width).toBeLessThanOrEqual(172);
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

  await page.getByText("특정 면 강제 입력").click();
  await page.getByRole("button", { name: /9번 면 C 컨택/ }).click();
  await expect(
    page.getByRole("button", { name: "타격 주사위 굴리기" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /9번 면 HIT 안타/ }).click();
  await expect(
    page.getByRole("button", { name: "안타 주사위 굴리기" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /1번 면 IH 내야 안타/ }).click();
  await expect(
    page.locator('.bbg-ball-flight[aria-label*="IH"]'),
  ).toBeVisible();
  await expect(page.locator(".bbg-flight-label")).toContainText("내야 안타");
  await expect(page.getByRole("img", { name: /1루 주자 있음/ })).toBeVisible();
  await expect(
    page.getByTestId("play-result").getByRole("heading", { name: "IH 단타" }),
  ).toBeVisible();
  await expect(page.getByTestId("play-result")).toContainText("타자");
  await expect(page.getByTestId("play-result")).toContainText("1루");

  const playableCard = page.getByRole("button", {
    name: /BK 보크 사용 가능/,
  });
  await expect(playableCard).toHaveAttribute("data-playable", "true");
  await expect(playableCard.locator("xpath=ancestor::section[1]")).toHaveClass(
    /is-active/,
  );
  await expect(
    playableCard.locator("xpath=ancestor::section[1]").getByText("선택 가능"),
  ).toBeVisible();
  expect(
    await playableCard.evaluate((element) =>
      getComputedStyle(element).boxShadow.includes("rgba"),
    ),
  ).toBe(true);
  await expect(page.getByRole("button", { name: "BK 사용" })).toHaveCount(0);
  await playableCard.click();
  await expect(page.getByRole("img", { name: /2루 주자 있음/ })).toBeVisible();
  while (
    await page
      .getByRole("button", { name: "카드 없이 진행" })
      .isVisible()
      .catch(() => false)
  ) {
    await page.getByRole("button", { name: "카드 없이 진행" }).click();
  }

  await page.getByText("새 경기 설정", { exact: true }).click();
  await page.getByRole("textbox", { name: "원정팀" }).fill("블루");
  await page.getByRole("textbox", { name: "홈팀" }).fill("레드");
  await page.getByLabel("경기 길이").selectOption("5");
  await page.getByRole("button", { name: /새 경기 시작/ }).click();
  await expect(page.locator(".bbg-scoreboard")).toHaveAttribute(
    "data-scheduled-innings",
    "5",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "현재 판정" })).toBeVisible();
  await expect(page.locator(".bbg-card-hand button")).toHaveCount(8);
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

test("중계 화면에서 득점부터 공수교대와 경기 종료까지 이어진다", async ({
  page,
}) => {
  await page.route("**/api/workbench/auth/me", (route) =>
    route.fulfill({ status: 200, json: { account: null } }),
  );
  await page.goto("/baseball-game");
  await page.getByText("특정 면 강제 입력").click();

  await page.getByRole("button", { name: /9번 면 C 컨택/ }).click();
  await page.getByRole("button", { name: /12번 면 HR 홈런/ }).click();
  await expect(page.getByTestId("play-result")).toContainText("+1점");
  await expect(page.getByRole("region", { name: /경기 점수판/ })).toContainText(
    "1",
  );

  const strikeOutSide = async () => {
    for (let pitch = 0; pitch < 9; pitch += 1) {
      await page.getByRole("button", { name: /1번 면 S 스트라이크/ }).click();
    }
  };

  await strikeOutSide();
  await expect(
    page.getByRole("region", { name: /경기 점수판, 1회말/ }),
  ).toBeVisible();
  await expect(page.locator(".bbg-team-score.is-batting")).toContainText(
    "홈팀",
  );
  await expect(page.getByTestId("play-result")).toContainText(
    "홈팀 첫 타자에게 투구",
  );

  await strikeOutSide();
  await strikeOutSide();
  await strikeOutSide();
  await strikeOutSide();
  await strikeOutSide();

  await expect(page.getByText("FINAL", { exact: true })).toBeVisible();
  await expect(page.locator(".bbg-winner-card strong")).toHaveText("원정팀");
  await expect(page.getByTestId("play-result")).toContainText("경기 종료");
  await expect(page.getByRole("button", { name: /주사위 굴리기/ })).toHaveCount(
    0,
  );
});
