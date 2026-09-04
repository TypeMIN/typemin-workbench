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
  await expect(page.getByLabel("원정팀 공격 중")).toContainText("원정팀 공격");
  await expect(page.locator(".bbg-fence")).toBeVisible();
  await expect(page.getByRole("img", { name: /주자 없음/ })).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);

  const baseLayout = await page.locator(".bbg-diamond").evaluate((diamond) => {
    const center = (selector: string) => {
      const rect = diamond.querySelector(selector)?.getBoundingClientRect();
      if (!rect) throw new Error(`${selector} 위치를 찾지 못했습니다.`);
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    };
    return {
      first: center(".bbg-base--first"),
      second: center(".bbg-base--second"),
      third: center(".bbg-base--third"),
      home: center(".bbg-home-plate"),
    };
  });
  expect(baseLayout.second.y).toBeLessThan(baseLayout.first.y);
  expect(baseLayout.home.y).toBeGreaterThan(baseLayout.first.y);
  expect(baseLayout.first.x).toBeGreaterThan(baseLayout.second.x);
  expect(baseLayout.third.x).toBeLessThan(baseLayout.second.x);
  expect(Math.abs(baseLayout.first.y - baseLayout.third.y)).toBeLessThan(4);

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

  await page.getByText("새 경기 설정", { exact: true }).click();
  await page.getByRole("textbox", { name: "원정팀" }).fill("블루");
  await page.getByRole("textbox", { name: "홈팀" }).fill("레드");
  await page.getByLabel("경기 길이").selectOption("5");
  await page.getByRole("button", { name: /새 경기 시작/ }).click();
  await expect(
    page.locator(".bbg-broadcast-heading").getByText(/5이닝 경기/),
  ).toBeVisible();
  await expect(page.getByText(/REV 0/)).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "현재 판정" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
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
  await expect(page.getByLabel("홈팀 공격 중")).toContainText("홈팀 공격");
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
