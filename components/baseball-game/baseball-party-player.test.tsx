import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGame,
  getGameView,
  transition,
} from "@/lib/baseball-game/engine";
import type { PartyPlayerSnapshot } from "@/lib/baseball-game/party/types";

import BaseballPartyPlayer from "./baseball-party-player";

function response(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function snapshot(canAct: boolean): PartyPlayerSnapshot {
  const state = createGame({
    innings: 3,
    awayTeamName: "블루",
    homeTeamName: "레드",
  });
  const me = {
    id: canAct ? "home1" : "home2",
    nickname: canAct ? "투수" : "유격수",
    team: "home" as const,
    connected: true,
  };
  return {
    roomCode: "ABC234",
    status: "playing",
    roomRevision: 5,
    actionOwner: "home",
    players: {
      away: [{ id: "away1", nickname: "타자", team: "away", connected: true }],
      home: [
        { id: "home1", nickname: "투수", team: "home", connected: true },
        { id: "home2", nickname: "유격수", team: "home", connected: true },
      ],
    },
    activeBatterId: "away1",
    activeDefenderId: "home1",
    view: getGameView(state, "home"),
    isHost: false,
    me,
    canAct,
    legalCards: [],
  };
}

describe("BaseballPartyPlayer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows the shared team hand while only the active defender can choose a pitch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ snapshot: snapshot(true) })),
    );
    render(<BaseballPartyPlayer roomCode="ABC234" />);
    expect(
      await screen.findByRole("region", { name: "홈팀 수비 공용 손패" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "스트라이크 선택" }),
    ).toBeEnabled();
    expect(screen.queryByText("공격 카드")).not.toBeInTheDocument();
  });

  it("keeps a non-active teammate read-only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ snapshot: snapshot(false) })),
    );
    render(<BaseballPartyPlayer roomCode="ABC234" />);
    expect(
      await screen.findByRole("heading", { name: "현재 투수님의 차례" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "스트라이크 선택" }),
    ).not.toBeInTheDocument();
  });

  it("confirms a player action before and after a delayed server response", async () => {
    const current = snapshot(true);
    const result = transition(createGame(current.view.config), {
      type: "SELECT_PITCH",
      target: "strike",
    });
    if (!result.ok) throw new Error("테스트 경기 진행 실패");
    const updated = {
      ...current,
      roomRevision: current.roomRevision + 1,
      actionOwner: "away" as const,
      canAct: false,
      view: getGameView(result.state, "home"),
    } satisfies PartyPlayerSnapshot;
    let resolveAction: ((value: Response) => void) | undefined;
    const actionResponse = new Promise<Response>((resolve) => {
      resolveAction = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input).endsWith("/party/actions")
          ? actionResponse
          : Promise.resolve(response({ snapshot: current })),
      ),
    );

    render(<BaseballPartyPlayer roomCode="ABC234" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "스트라이크 선택" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "스트라이크 선택 요청 중",
    );
    expect(
      screen.getByRole("button", { name: "스트라이크 선택" }),
    ).toBeDisabled();

    resolveAction?.(response({ snapshot: updated }));
    expect(await screen.findByText("스트라이크 선택 반영 완료")).toBeVisible();
    expect(screen.getByText("팀원의 결정을 기다리는 중")).toBeVisible();
  });
});
