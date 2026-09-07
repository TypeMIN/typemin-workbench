import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createGame, getGameView } from "@/lib/baseball-game/engine";
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

  it("shows the shared team hand while only the active defender can roll", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ snapshot: snapshot(true) })),
    );
    render(<BaseballPartyPlayer roomCode="ABC234" />);
    expect(
      await screen.findByRole("region", { name: "홈팀 수비 공용 손패" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "주사위 굴리기" })).toBeEnabled();
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
      screen.queryByRole("button", { name: "주사위 굴리기" }),
    ).not.toBeInTheDocument();
  });
});
