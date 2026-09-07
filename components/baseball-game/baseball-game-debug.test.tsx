import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BaseballGameDebug from "./baseball-game-debug";

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

describe("BaseballGameDebug", () => {
  beforeEach(() => {
    routerPush.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
  });

  afterEach(() => {
    window.sessionStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the initial local game state and forced D12 faces", () => {
    const { container } = render(<BaseballGameDebug />);

    expect(screen.getByText("PRO-CARDS-V1 · LOCAL 2P")).toBeVisible();
    expect(screen.getByText("로컬 2인")).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "게임 모드 변경, 현재 로컬 2인",
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole("dialog", { name: /기기를 넘겨주세요/ }),
    ).not.toBeInTheDocument();
    expect(container.querySelector("main")).not.toHaveAttribute("inert");

    expect(
      screen.getByRole("heading", { name: "야구 게임 라이브" }),
    ).toBeVisible();
    expect(screen.getByLabelText("현재 진행 단계 투구")).toBeVisible();
    expect(screen.getByText(/투구 결과를 정합니다/)).toBeVisible();
    expect(
      screen.getByRole("region", {
        name: /경기 점수판, 1회초, 무사, 주자 없음/,
      }),
    ).toBeVisible();
    expect(screen.getByLabelText("볼 0")).toBeVisible();
    expect(screen.getByLabelText("스트라이크 0")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "첫 투구를 준비하세요" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "투구 주사위 굴리기" }),
    ).toBeVisible();
    expect(container.querySelector(".bbg-d12")).toBeVisible();
    expect(screen.getAllByRole("button", { name: /번 면/ })).toHaveLength(12);
    expect(screen.getByRole("img", { name: /주자 없음/ })).toBeVisible();
    expect(
      container.querySelector(".bbg-team-score.is-batting"),
    ).toHaveTextContent("원정팀");
    expect(container.querySelector(".bbg-fence")).toBeVisible();
    expect(container.querySelector(".bbg-fielders")).not.toBeInTheDocument();
    expect(
      container.querySelector(".bbg-distance-marks"),
    ).not.toBeInTheDocument();
    expect(container.querySelectorAll(".bbg-team-score")).toHaveLength(2);
    expect(
      container.querySelectorAll(
        '.bbg-count-line[data-tone="ball"] .bbg-count-lights i',
      ),
    ).toHaveLength(3);
    expect(
      container.querySelectorAll(
        '.bbg-count-line[data-tone="strike"] .bbg-count-lights i',
      ),
    ).toHaveLength(2);
    expect(
      container.querySelectorAll(
        '.bbg-count-line[data-tone="out"] .bbg-count-lights i',
      ),
    ).toHaveLength(2);
    expect(
      screen.getByLabelText("주자 없음").querySelector("small"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelectorAll(".bbg-team-score.is-batting"),
    ).toHaveLength(1);
    expect(
      screen.getByRole("region", { name: "원정팀 공격 비공개 손패" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "홈팀 수비 손패" }),
    ).toBeVisible();
    expect(container.querySelectorAll(".bbg-card-hand button")).toHaveLength(4);
    expect(container.querySelectorAll(".bbg-card-back")).toHaveLength(4);
    expect(
      container.querySelectorAll(".bbg-card-hand button[data-tier]"),
    ).toHaveLength(4);
    expect(
      screen.queryByRole("button", { name: "카드 없이 진행" }),
    ).not.toBeInTheDocument();
  });

  it("supports random rolls and exact forced-result phase changes", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(<BaseballGameDebug />);

    fireEvent.click(screen.getByRole("button", { name: "투구 주사위 굴리기" }));
    expect(screen.getByLabelText("스트라이크 1")).toBeVisible();
    expect(
      document.querySelectorAll(
        '.bbg-count-line[data-tone="strike"] i[data-active="true"]',
      ),
    ).toHaveLength(1);
    expect(screen.getByText("같은 타자에게 다음 투구")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /9번 면 C 컨택/ }));
    expect(
      screen.getByRole("button", { name: "타격 주사위 굴리기" }),
    ).toBeVisible();
    expect(screen.getByText(/공이 배트에 맞았습니다/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /9번 면 HIT 안타/ }));
    expect(
      screen.getByRole("button", { name: "안타 주사위 굴리기" }),
    ).toBeVisible();
    expect(screen.getByText(/타구 방향과 모든 주자의 진루/)).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: /1번 면 IH 내야 안타/ }),
    );
    expect(
      document.querySelector('.bbg-ball-flight[aria-label*="IH"]'),
    ).toBeVisible();
    expect(screen.getByRole("img", { name: /1루 주자 있음/ })).toBeVisible();
    const result = screen.getByTestId("play-result");
    expect(
      within(result).getByRole("heading", { name: "IH 단타" }),
    ).toBeVisible();
    expect(within(result).getByText("타자")).toBeVisible();
    expect(within(result).getByText("1루")).toBeVisible();
    const playableCard = screen.getByRole("button", {
      name: /BK 보크 사용 가능/,
    });
    expect(playableCard).toHaveAttribute("data-playable", "true");
    expect(playableCard.closest(".bbg-card-hand")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(
      screen.queryByRole("button", { name: "BK 사용" }),
    ).not.toBeInTheDocument();
    fireEvent.click(playableCard);
    expect(screen.getByRole("img", { name: /2루 주자 있음/ })).toBeVisible();
    expect(document.querySelectorAll(".bbg-card-hand button")).toHaveLength(4);
    for (let step = 0; step < 8; step += 1) {
      const pass = screen.queryByRole("button", { name: "카드 없이 진행" });
      if (!pass) break;
      fireEvent.click(pass);
    }
    expect(
      screen.getByRole("button", { name: "투구 주사위 굴리기" }),
    ).toBeVisible();
  });

  it("creates a new game from edited team names and innings", () => {
    render(<BaseballGameDebug />);
    fireEvent.click(screen.getByText("새 경기 설정", { exact: true }));
    const setup = screen
      .getByText("새 경기 설정", { exact: true })
      .closest("details");
    if (!setup) throw new Error("새 경기 패널을 찾지 못했습니다.");
    const form = within(setup);

    expect(form.getByLabelText("게임 모드")).toHaveValue("local_two_player");

    fireEvent.change(form.getByLabelText("원정팀"), {
      target: { value: "블루" },
    });
    fireEvent.change(form.getByLabelText("홈팀"), {
      target: { value: "레드" },
    });
    fireEvent.change(form.getByLabelText("경기 길이"), {
      target: { value: "5" },
    });
    fireEvent.click(form.getByRole("button", { name: /새 경기 시작/ }));

    const scoreboard = screen.getByRole("region", { name: /경기 점수판/ });
    expect(within(scoreboard).getByText("블루")).toBeVisible();
    expect(within(scoreboard).getByText("레드")).toBeVisible();
    expect(scoreboard).toHaveAttribute("data-scheduled-innings", "5");
  });

  it("switches to solo mode, conceals the AI hand, and advances the AI turn", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(<BaseballGameDebug />);

    fireEvent.click(screen.getByText("새 경기 설정", { exact: true }));
    const setup = screen
      .getByText("새 경기 설정", { exact: true })
      .closest("details");
    if (!setup) throw new Error("새 경기 패널을 찾지 못했습니다.");
    const form = within(setup);

    fireEvent.change(form.getByLabelText("게임 모드"), {
      target: { value: "solo_ai" },
    });
    expect(form.getByLabelText("내 팀")).toHaveValue("away");
    fireEvent.click(form.getByRole("button", { name: /새 경기 시작/ }));

    expect(screen.getByText("PRO-CARDS-V1 · SOLO AI")).toBeVisible();
    expect(screen.getByText("AI 대전 · 원정팀")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("홈팀 판단 중");
    expect(
      screen.queryByRole("button", { name: "투구 주사위 굴리기" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "원정팀 공격 손패" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "홈팀 수비 비공개 손패" }),
    ).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(650);
    });

    expect(screen.getByLabelText("스트라이크 1")).toBeVisible();
  });

  it("lets a solo player choose the home team and take the first pitch turn", () => {
    render(<BaseballGameDebug />);

    fireEvent.click(screen.getByText("새 경기 설정", { exact: true }));
    const setup = screen
      .getByText("새 경기 설정", { exact: true })
      .closest("details");
    if (!setup) throw new Error("새 경기 패널을 찾지 못했습니다.");
    const form = within(setup);
    fireEvent.change(form.getByLabelText("게임 모드"), {
      target: { value: "solo_ai" },
    });
    fireEvent.change(form.getByLabelText("내 팀"), {
      target: { value: "home" },
    });
    fireEvent.click(form.getByRole("button", { name: /새 경기 시작/ }));

    expect(screen.getByText("AI 대전 · 홈팀")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "투구 주사위 굴리기" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "홈팀 수비 손패" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "원정팀 공격 비공개 손패" }),
    ).toBeVisible();
  });

  it("creates a multiplayer room from the game mode selector", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) !== "/api/baseball-game/rooms") {
        return new Promise<Response>(() => undefined);
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            roomCode: "ABC234",
            roomUrl: "/baseball-game/rooms/ABC234",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<BaseballGameDebug />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "게임 모드 변경, 현재 로컬 2인",
      }),
    );
    const setup = screen
      .getByText("새 경기 설정", { exact: true })
      .closest("details");
    if (!setup) throw new Error("새 경기 패널을 찾지 못했습니다.");
    const form = within(setup);
    fireEvent.change(form.getByLabelText("게임 모드"), {
      target: { value: "multiplayer" },
    });
    expect(form.getByLabelText("참가할 방 코드")).toHaveValue("");
    fireEvent.click(form.getByRole("button", { name: "멀티플레이 방 만들기" }));

    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith("/baseball-game/rooms/ABC234"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/baseball-game/rooms",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("creates a party room with one public join link and no browser-stored tokens", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) !== "/api/baseball-game/rooms") {
        return new Promise<Response>(() => undefined);
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            roomCode: "ABC234",
            roomUrl: "/baseball-game/party/ABC234",
            joinUrl: "/baseball-game/party/ABC234/join",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<BaseballGameDebug />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "게임 모드 변경, 현재 로컬 2인",
      }),
    );
    const setup = screen
      .getByText("새 경기 설정", { exact: true })
      .closest("details");
    if (!setup) throw new Error("새 경기 패널을 찾지 못했습니다.");
    const form = within(setup);
    fireEvent.change(form.getByLabelText("게임 모드"), {
      target: { value: "party" },
    });
    fireEvent.click(
      form.getByRole("button", { name: "파티플레이 경기 만들기" }),
    );

    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith("/baseball-game/party/ABC234"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/baseball-game/rooms",
      expect.objectContaining({
        body: expect.stringContaining('"mode":"party"'),
      }),
    );
    expect(window.sessionStorage.length).toBe(0);
  });

  it("shows strikeout emphasis and switches the visible hand after changing sides", () => {
    render(<BaseballGameDebug />);

    for (let pitch = 0; pitch < 3; pitch += 1) {
      fireEvent.click(
        screen.getByRole("button", { name: /1번 면 S 스트라이크/ }),
      );
    }
    expect(screen.getByRole("status")).toHaveTextContent("STRIKE OUT");

    for (let pitch = 0; pitch < 6; pitch += 1) {
      fireEvent.click(
        screen.getByRole("button", { name: /1번 면 S 스트라이크/ }),
      );
    }
    const sideChange = screen.getByRole("dialog", { name: "공수 교대" });
    expect(sideChange).toBeVisible();
    expect(within(sideChange).getByText("1회말 시작")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "다음 공격 준비" }));
    expect(
      screen.queryByRole("dialog", { name: /기기를 넘겨주세요/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /경기 점수판, 1회말/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "홈팀 공격 비공개 손패" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "원정팀 수비 손패" }),
    ).toBeVisible();
  });
});
