import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createGame, getGameView } from "@/lib/baseball-game/engine";
import { buildSeriesView } from "@/lib/baseball-game/multiplayer/series";
import {
  buildShotClockView,
  createClockState,
} from "@/lib/baseball-game/multiplayer/shot-clock";
import type { MultiplayerSpectatorSnapshot } from "@/lib/baseball-game/multiplayer/types";

import BaseballRoomSpectator from "./baseball-room-spectator";

function watchSnapshot(): MultiplayerSpectatorSnapshot {
  const state = createGame({
    innings: 3,
    awayTeamName: "블루",
    homeTeamName: "레드",
  });
  const clock = createClockState(0);
  return {
    roomCode: "ABC234",
    status: "playing",
    actionOwner: "home",
    presence: {
      away: { presence: "online", lastSeenAgoMs: 1_000 },
      home: { presence: "offline", lastSeenAgoMs: 90_000 },
    },
    view: getGameView(state, "public"),
    clock: buildShotClockView({
      state,
      revisionStartedAt: new Date().toISOString(),
      clock,
      playing: true,
      now: Date.now(),
    }),
    reactions: [],
    series: buildSeriesView(null, state, clock),
    realtimeTopic: null,
  };
}

describe("BaseballRoomSpectator", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the stadium, both teams and who is deciding without any hand", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ snapshot: watchSnapshot() }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<BaseballRoomSpectator roomCode="ABC234" />);

    const rail = await screen.findByRole("complementary", {
      name: "관전 정보",
    });
    const teams = within(within(rail).getByRole("list")).getAllByRole(
      "listitem",
    );
    expect(teams[0]).toHaveTextContent("블루접속 중타자 선택 중");
    expect(teams[1]).toHaveTextContent("레드연결 끊김투수 선택 중");
    expect(screen.getByRole("region", { name: "야구 경기장" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "스트라이크 선택" }),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".bbg-room-hand")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/baseball-game/rooms/ABC234/watch",
      { cache: "no-store" },
    );
  });

  it("explains a missing room", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "방을 찾을 수 없습니다." }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    render(<BaseballRoomSpectator roomCode="ABC234" />);
    expect(
      await screen.findByRole("heading", { name: "관전할 수 없습니다" }),
    ).toBeVisible();
    expect(screen.getByText("방을 찾을 수 없습니다.")).toBeVisible();
  });
});
