import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGame,
  getGameView,
  transition,
} from "@/lib/baseball-game/engine";
import type { MultiplayerRoomSnapshot } from "@/lib/baseball-game/multiplayer/types";

import BaseballMultiplayerRoom from "./baseball-multiplayer-room";

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
    opponentConnected: status === "playing",
    actionOwner: "home",
    isYourTurn: seat === "home",
    legalCards: [],
    view: getGameView(state, seat),
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
    expect(
      container.querySelector(".bbg-mp-field .bbg-stadium svg"),
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
    expect(
      screen.getByRole("button", { name: "투구 주사위 굴리기" }),
    ).toBeVisible();
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
      type: "PITCH_RESULT",
      face: "S",
    });
    if (!result.ok) throw new Error("테스트 경기 진행 실패");
    const updated = {
      ...current,
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
      await screen.findByRole("button", { name: "투구 주사위 굴리기" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("투구 주사위 요청 중");
    expect(
      screen.getByRole("button", { name: /서버 판정 확인 중/ }),
    ).toBeDisabled();
    expect(container.querySelector(".bbg-mp-board")).toHaveAttribute(
      "aria-busy",
      "true",
    );

    resolveAction?.(response({ snapshot: updated }));
    expect(await screen.findByText("투구 주사위 반영 완료")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("스트라이크");
  });
});
