import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGame,
  getGameView,
  transition,
} from "@/lib/baseball-game/engine";
import { buildSeriesView } from "@/lib/baseball-game/multiplayer/series";
import {
  FORFEIT_AFTER_CONSECUTIVE_TIMEOUTS,
  buildShotClockView,
  createClockState,
} from "@/lib/baseball-game/multiplayer/shot-clock";
import type { MultiplayerRoomSnapshot } from "@/lib/baseball-game/multiplayer/types";

import BaseballMultiplayerRoom from "./baseball-multiplayer-room";

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,AA=="),
  },
}));

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function snapshot(seat: "away" | "home", status: "lobby" | "playing") {
  const state = createGame({
    innings: 3,
    awayTeamName: "블루",
    homeTeamName: "레드",
  });
  return {
    roomCode: "ABC234",
    status,
    seat,
    opponent:
      status === "playing"
        ? { presence: "online", lastSeenAgoMs: 0 }
        : { presence: "absent", lastSeenAgoMs: null },
    actionOwner: "home",
    isYourTurn: seat === "home",
    legalCards: [],
    view: getGameView(state, seat),
    clock: buildShotClockView({
      state,
      revisionStartedAt: new Date().toISOString(),
      clock: createClockState(0),
      playing: status === "playing",
      now: Date.now(),
    }),
    reactions: [],
    series: buildSeriesView(null, state, createClockState(0)),
  } satisfies MultiplayerRoomSnapshot;
}

describe("BaseballMultiplayerRoom", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the host lobby with only the away team's hand", async () => {
    const hostSnapshot = snapshot("away", "lobby");
    const hiddenIds = createGame({
      innings: 3,
      awayTeamName: "블루",
      homeTeamName: "레드",
    }).cards.defense.hand.map((card) => card.instanceId);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ snapshot: hostSnapshot })),
    );

    const { container } = render(<BaseballMultiplayerRoom roomCode="ABC234" />);

    expect(await screen.findByText("홈팀 참가 대기 중")).toBeVisible();
    expect(screen.getByLabelText("방 코드 ABC234")).toBeVisible();
    expect(
      screen.getByRole("region", { name: "블루 공격 손패" }),
    ).toBeVisible();
    expect(screen.getAllByRole("button", { name: /사용 불가/ })).toHaveLength(
      4,
    );
    expect(container.querySelectorAll(".bbg-card-effect")).toHaveLength(4);
    expect(container.querySelectorAll(".bbg-card-timing")).toHaveLength(4);
    expect(
      screen.getAllByRole("button", {
        name: /사용 불가: 현재 행동 차례가 아닙니다/,
      }),
    ).toHaveLength(4);
    expect(
      container.querySelector(".bbg-room-stage .bbg-stadium svg"),
    ).toHaveAttribute("viewBox", "0 0 900 700");
    for (const instanceId of hiddenIds) {
      expect(container).not.toHaveTextContent(instanceId);
    }
  });

  it("lets an unseated device claim the home seat", async () => {
    const homeSnapshot = snapshot("home", "playing");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ error: "좌석 없음" }, 401))
      .mockResolvedValueOnce(response({ snapshot: homeSnapshot }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BaseballMultiplayerRoom roomCode="ABC234" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "홈팀으로 참가" }),
    );

    expect(
      await screen.findByRole("region", { name: "레드 수비 손패" }),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "투구 선택" })).toBeVisible();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/baseball-game/rooms/ABC234/join",
        { method: "POST" },
      ),
    );
  });

  it("shows an immediate action receipt while the server response is delayed", async () => {
    const current = snapshot("home", "playing");
    const result = transition(createGame(current.view.config), {
      type: "SELECT_PITCH",
      target: "strike",
    });
    if (!result.ok) throw new Error("테스트 경기 진행 실패");
    const updated = {
      ...current,
      actionOwner: "away" as const,
      isYourTurn: false,
      view: getGameView(result.state, "home"),
    } satisfies MultiplayerRoomSnapshot;
    let resolveAction: ((value: Response) => void) | undefined;
    const actionResponse = new Promise<Response>((resolve) => {
      resolveAction = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) =>
      String(input).endsWith("/actions")
        ? actionResponse
        : Promise.resolve(response({ snapshot: current })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<BaseballMultiplayerRoom roomCode="ABC234" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "스트라이크 선택" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "스트라이크 선택 요청 중",
    );
    expect(
      screen.getByRole("button", { name: "스트라이크 선택" }),
    ).toBeDisabled();
    expect(container.querySelector(".bbg-room-board")).toHaveAttribute(
      "aria-busy",
      "true",
    );

    resolveAction?.(response({ snapshot: updated }));
    expect(await screen.findByText("스트라이크 선택 반영 완료")).toBeVisible();
    // The board keeps the pre-pitch state until the lock scene finishes.
    expect(
      await screen.findByText(
        "상대 타자가 노림수를 정하는 중",
        {},
        { timeout: 4_000 },
      ),
    ).toBeVisible();
  });

  it("shows the opponent's live activity, presence and clock", async () => {
    const awaySnapshot = {
      ...snapshot("away", "playing"),
      opponent: { presence: "away" as const, lastSeenAgoMs: 1_000 },
    } satisfies MultiplayerRoomSnapshot;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ snapshot: awaySnapshot })),
    );

    render(<BaseballMultiplayerRoom roomCode="ABC234" />);

    expect(
      await screen.findByText("상대 투수가 사인을 고르는 중"),
    ).toBeVisible();
    expect(
      screen.getByText("상대가 경기 화면을 벗어나 있습니다."),
    ).toBeVisible();
    expect(screen.getByText(/자리 비움/)).toBeVisible();
    expect(
      screen.getByRole("timer", { name: /상대 결정 남은 시간/ }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /작전 타임/ })).toBeNull();
  });

  it("calls a timeout on the deciding team's turn", async () => {
    const homeSnapshot = snapshot("home", "playing");
    const fetchMock = vi.fn(() =>
      Promise.resolve(response({ snapshot: homeSnapshot })),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<BaseballMultiplayerRoom roomCode="ABC234" />);
    expect(
      await screen.findByRole("timer", { name: /내 결정 남은 시간/ }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "작전 타임 · 2회 남음" }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/baseball-game/rooms/ABC234/clock",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ type: "CALL_TIMEOUT", expectedRevision: 0 }),
        }),
      ),
    );
  });

  it("offers a forfeit claim only after repeated opponent timeouts", async () => {
    const base = snapshot("away", "playing");
    const stalled = {
      ...base,
      clock: {
        ...base.clock,
        consecutiveTimeouts: {
          away: 0,
          home: FORFEIT_AFTER_CONSECUTIVE_TIMEOUTS,
        },
      },
    } satisfies MultiplayerRoomSnapshot;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ snapshot: stalled })),
    );

    render(<BaseballMultiplayerRoom roomCode="ABC234" />);

    expect(
      await screen.findByRole("button", { name: "몰수승 선언" }),
    ).toBeVisible();
  });

  it("shows a join QR code in the lobby", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(response({ snapshot: snapshot("away", "lobby") })),
    );
    render(<BaseballMultiplayerRoom roomCode="ABC234" />);
    expect(await screen.findByAltText("홈팀 참가 QR 코드")).toBeVisible();
  });

  it("sends a reaction and floats the opponent's reactions on the stage", async () => {
    const base = snapshot("away", "playing");
    let current: MultiplayerRoomSnapshot = base;
    const fetchMock = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        response({
          snapshot: String(input).endsWith("/reactions")
            ? {
                ...base,
                reactions: [
                  {
                    id: "mine-1",
                    team: "away",
                    kind: "clap",
                    at: new Date().toISOString(),
                  },
                ],
              }
            : current,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<BaseballMultiplayerRoom roomCode="ABC234" />);
    fireEvent.click(await screen.findByRole("button", { name: "박수" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/baseball-game/rooms/ABC234/reactions",
        expect.objectContaining({ body: JSON.stringify({ kind: "clap" }) }),
      ),
    );
    expect(await screen.findByText("나")).toBeVisible();

    current = {
      ...base,
      reactions: [
        {
          id: "theirs-1",
          team: "home",
          kind: "taunt",
          at: new Date().toISOString(),
        },
      ],
    };
    expect(
      await screen.findByText("한 번 더 와봐", { selector: "span" }),
    ).toBeVisible();
  });

  it("offers a rematch, series record and highlights after the final out", async () => {
    const base = snapshot("home", "playing");
    const finishedState = {
      ...createGame(base.view.config),
      phase: "finished" as const,
      winner: "home" as const,
      score: { away: 1, home: 2 },
    };
    const finished = {
      ...base,
      status: "finished",
      isYourTurn: false,
      actionOwner: null,
      view: getGameView(finishedState, "home"),
      series: {
        ...buildSeriesView(null, finishedState, createClockState(0)),
        rematchVotes: { away: true, home: false },
      },
    } as MultiplayerRoomSnapshot;
    const fetchMock = vi.fn(() =>
      Promise.resolve(response({ snapshot: finished })),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<BaseballMultiplayerRoom roomCode="ABC234" />);

    expect(await screen.findByText("레드 승리")).toBeVisible();
    expect(screen.getByLabelText("시리즈 전적")).toHaveTextContent("1차전");
    expect(screen.getByText("상대가 재대결을 신청했습니다.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /재대결 수락/ }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/baseball-game/rooms/ABC234/rematch",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});
