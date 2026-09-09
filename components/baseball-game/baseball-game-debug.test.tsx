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

  it("starts in solo AI mode with five one-tap pitch choices", () => {
    const { container } = render(<BaseballGameDebug />);

    expect(screen.getByText("PITCH-DUEL-V1 · SOLO AI")).toBeVisible();
    expect(screen.getByText("AI 대전 · 홈팀")).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "게임 모드 변경, 현재 AI 대전 홈팀",
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
    expect(
      screen.getByText(/투수가 한 번의 선택으로 코스를 정합니다/),
    ).toBeVisible();
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
      screen.getByRole("region", { name: "투구 코스 선택" }),
    ).toBeVisible();
    expect(container.querySelector(".bbg-d12")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".bbg-pitch-choice")).toHaveLength(5);
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

  it("resolves a private player pitch and the AI batter decision without dice", () => {
    vi.useFakeTimers();
    render(<BaseballGameDebug />);

    fireEvent.click(screen.getByRole("button", { name: "볼 선택" }));
    expect(screen.getByText("투구 코스를 선택했습니다")).toBeVisible();
    expect(screen.getByText("원정팀 판단 중")).toBeVisible();
    act(() => {
      vi.advanceTimersByTime(650);
    });
    expect(screen.getByTestId("play-result")).toHaveTextContent("투수 볼");
    expect(screen.getByTestId("play-result")).toHaveTextContent(/타자/);
    expect(screen.queryByText(/특정 면 강제 입력/)).not.toBeInTheDocument();
  });

  it("creates a new game from edited team names and innings", () => {
    render(<BaseballGameDebug />);
    fireEvent.click(screen.getByText("새 경기 설정", { exact: true }));
    const setup = screen
      .getByText("새 경기 설정", { exact: true })
      .closest("details");
    if (!setup) throw new Error("새 경기 패널을 찾지 못했습니다.");
    const form = within(setup);

    expect(form.getByLabelText("게임 모드")).toHaveValue("solo_ai");
    expect(form.queryByRole("option", { name: /로컬 2인/ })).toBeNull();

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

  it("conceals the AI hand and advances the AI pitch turn", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(<BaseballGameDebug />);

    fireEvent.click(screen.getByText("새 경기 설정", { exact: true }));
    const setup = screen
      .getByText("새 경기 설정", { exact: true })
      .closest("details");
    if (!setup) throw new Error("새 경기 패널을 찾지 못했습니다.");
    const form = within(setup);

    expect(form.getByLabelText("내 팀")).toHaveValue("home");
    fireEvent.change(form.getByLabelText("내 팀"), {
      target: { value: "away" },
    });
    fireEvent.click(form.getByRole("button", { name: /새 경기 시작/ }));

    expect(screen.getByText("PITCH-DUEL-V1 · SOLO AI")).toBeVisible();
    expect(screen.getByText("AI 대전 · 원정팀")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("홈팀 판단 중");
    expect(
      screen.queryByRole("region", { name: "투구 코스 선택" }),
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

    expect(screen.getByRole("region", { name: "타격 판단" })).toBeVisible();
  });

  it("lets a solo player choose the home team and take the first pitch turn", () => {
    render(<BaseballGameDebug />);

    fireEvent.click(screen.getByText("새 경기 설정", { exact: true }));
    const setup = screen
      .getByText("새 경기 설정", { exact: true })
      .closest("details");
    if (!setup) throw new Error("새 경기 패널을 찾지 못했습니다.");
    const form = within(setup);
    fireEvent.change(form.getByLabelText("내 팀"), {
      target: { value: "home" },
    });
    fireEvent.click(form.getByRole("button", { name: /새 경기 시작/ }));

    expect(screen.getByText("AI 대전 · 홈팀")).toBeVisible();
    expect(
      screen.getByRole("region", { name: "투구 코스 선택" }),
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
        name: "게임 모드 변경, 현재 AI 대전 홈팀",
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
        name: "게임 모드 변경, 현재 AI 대전 홈팀",
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

  it("joins a party room by code without using a camera or creating a room", () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    render(<BaseballGameDebug />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "게임 모드 변경, 현재 AI 대전 홈팀",
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
    fireEvent.change(form.getByLabelText("참가할 방 코드"), {
      target: { value: "abc234" },
    });
    fireEvent.click(form.getByRole("button", { name: "파티 방 참가하기" }));

    expect(routerPush).toHaveBeenCalledWith("/baseball-game/party/ABC234/join");
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/baseball-game/rooms",
      expect.anything(),
    );
  });
});
