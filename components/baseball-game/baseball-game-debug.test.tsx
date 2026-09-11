import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGame } from "@/lib/baseball-game/engine";

import BaseballGameDebug, { BaseballStadium } from "./baseball-game-debug";

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

  it("starts in solo AI mode with a two-choice catcher-view duel", () => {
    const { container } = render(<BaseballGameDebug />);

    expect(screen.getByText("야구 게임")).toBeVisible();
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
    expect(screen.getByRole("region", { name: "투구 선택" })).toBeVisible();
    expect(container.querySelector(".bbg-d12")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".bbg-pitch-choice")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "스트라이크 선택" }),
    ).toHaveTextContent("스트라이크");
    expect(screen.getByRole("button", { name: "볼 선택" })).toHaveTextContent(
      "볼",
    );
    expect(container.querySelector(".bbg-choice-dock")).toBeVisible();
    expect(container).not.toHaveTextContent("%");
    expect(
      screen.getByRole("img", { name: "포수 시점 스트라이크존" }),
    ).toBeVisible();
    expect(screen.getByRole("img", { name: /주자 없음/ })).toBeVisible();
    expect(
      container.querySelector(".bbg-team-score.is-batting"),
    ).toHaveTextContent("원정팀");
    expect(container.querySelector(".bbg-stadium")).toHaveAttribute(
      "data-camera",
      "catcher",
    );
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
    expect(container.querySelector(".bbg-card-hands")).toHaveAttribute(
      "data-card-window",
      "false",
    );
    expect(
      container.querySelectorAll(".bbg-card-hand button[data-tier]"),
    ).toHaveLength(4);
    expect(
      screen.queryByRole("button", { name: "카드 없이 진행" }),
    ).not.toBeInTheDocument();
  });

  it("resolves a private player pitch and the AI batter decision without dice", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(<BaseballGameDebug />);

    fireEvent.click(screen.getByRole("button", { name: "볼 선택" }));
    expect(screen.getByText("볼을 선택했습니다")).toBeVisible();
    expect(screen.getByText("원정팀 판단 중")).toBeVisible();
    expect(document.querySelector(".bbg-choice-flash")).toHaveTextContent("볼");
    expect(document.querySelector(".bbg-choice-dock")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "이번 승부 선택 기록" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /예상 투구 위치/ }),
    ).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(950);
    });
    expect(screen.getByTestId("play-result")).toBeVisible();
    expect(screen.getByTestId("play-result")).toHaveTextContent(
      "F3 희생플라이",
    );
    expect(
      screen.getByRole("list", { name: "현재 타자 누적 투구" }),
    ).toBeVisible();
    expect(
      document.querySelector(".bbg-pitch-marker[data-current='true']"),
    ).toBeVisible();
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(
      screen.queryByRole("button", { name: "현재 연출 빠르게 넘기기" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/특정 면 강제 입력/)).not.toBeInTheDocument();
  });

  it("removes the persistent choice strip while keeping the pitch on the zone", () => {
    const game = createGame({
      innings: 3,
      awayTeamName: "원정팀",
      homeTeamName: "홈팀",
    });
    game.phase = "awaiting_pitch";
    game.eventLog = [
      {
        sequence: 1,
        revision: 1,
        inning: 1,
        half: "top",
        kind: "card_play",
        summary: "수비 카드 · 보크",
        cardId: "BK",
        cardRole: "defense",
        runs: 0,
        outsRecorded: 0,
        moves: [],
      },
      {
        sequence: 2,
        revision: 2,
        inning: 1,
        half: "top",
        kind: "pitch_commit",
        summary: "투수가 코스를 선택했습니다.",
        runs: 0,
        outsRecorded: 0,
        moves: [],
      },
      {
        sequence: 3,
        revision: 3,
        inning: 1,
        half: "top",
        kind: "pitch_result",
        summary: "스트라이크 · 지켜보기 · 투수 승부 성공 · 스트라이크",
        face: "S",
        pitchTarget: "strike",
        swingDecision: "take",
        duelWinner: "pitcher",
        runs: 0,
        outsRecorded: 0,
        moves: [],
      },
    ];

    render(<BaseballStadium face="S" game={game} />);

    expect(
      screen.queryByRole("region", { name: "이번 승부 선택 기록" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("1구 S")).toBeVisible();
    expect(
      screen.getByRole("list", { name: "현재 타자 누적 투구" }),
    ).toHaveTextContent("1스트라이크");
  });

  it("keeps every pitch of the current plate appearance on screen", () => {
    const game = createGame({
      innings: 3,
      awayTeamName: "원정팀",
      homeTeamName: "홈팀",
    });
    game.phase = "awaiting_pitch";
    game.eventLog = [
      {
        sequence: 1,
        revision: 1,
        inning: 1,
        half: "top",
        kind: "pitch_result",
        summary: "스트라이크",
        face: "S",
        pitchTarget: "strike",
        swingDecision: "take",
        duelWinner: "pitcher",
        runs: 0,
        outsRecorded: 0,
        moves: [],
      },
      {
        sequence: 2,
        revision: 2,
        inning: 1,
        half: "top",
        kind: "pitch_result",
        summary: "볼",
        face: "B",
        pitchTarget: "ball",
        swingDecision: "take",
        duelWinner: "batter",
        runs: 0,
        outsRecorded: 0,
        moves: [],
      },
    ];

    render(<BaseballStadium face="B" game={game} />);

    const sequence = screen.getByRole("list", {
      name: "현재 타자 누적 투구",
    });
    expect(sequence).toHaveTextContent("1스트라이크");
    expect(sequence).toHaveTextContent("2볼");
    expect(sequence.querySelectorAll("li")).toHaveLength(2);
    expect(sequence.querySelector('li[data-current="true"]')).toHaveTextContent(
      "2볼",
    );
    expect(sequence.querySelector('li[data-current="true"]')).toHaveAttribute(
      "data-zone",
      "ball",
    );
    expect(
      screen.getByRole("img", { name: "포수 시점 스트라이크존" }),
    ).toHaveAttribute("data-last-zone", "ball");
    expect(
      document.querySelector(".bbg-pitch-marker[data-current='true']"),
    ).toHaveAttribute("data-zone", "ball");
  });

  it("switches from catcher view to the full field when a ball is put in play", () => {
    const game = createGame({
      innings: 3,
      awayTeamName: "원정팀",
      homeTeamName: "홈팀",
    });
    game.phase = "awaiting_card";
    const { container } = render(<BaseballStadium face="HR" game={game} />);

    expect(container.querySelector(".bbg-stadium")).toHaveAttribute(
      "data-camera",
      "field",
    );
    expect(
      screen.queryByRole("img", { name: "포수 시점 스트라이크존" }),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".bbg-fence")).toBeVisible();
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

    expect(screen.getByText("야구 게임")).toBeVisible();
    expect(screen.getByText("AI 대전 · 원정팀")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("홈팀 판단 중");
    expect(
      screen.queryByRole("region", { name: "투구 선택" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "원정팀 공격 손패" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "홈팀 수비 비공개 손패" }),
    ).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(950);
    });

    expect(document.querySelector(".bbg-choice-flash")).toHaveTextContent(
      "투수 선택 완료",
    );
    expect(
      screen.queryByRole("region", { name: "타격 선택" }),
    ).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(850);
    });

    expect(screen.getByRole("region", { name: "타격 선택" })).toBeVisible();
    expect(
      screen.getByRole("img", { name: "포수 시점 스트라이크존" }),
    ).toBeVisible();
    expect(screen.queryByText(/예상 투구 위치/)).not.toBeInTheDocument();
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
    expect(screen.getByRole("region", { name: "투구 선택" })).toBeVisible();
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
