import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createGame, getGameView } from "@/lib/baseball-game/engine";
import {
  partyInviteStorageKey,
  type PartyRoomSnapshot,
} from "@/lib/baseball-game/multiplayer/types";

import BaseballPartyScreen from "./baseball-party-screen";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function partySnapshot() {
  const state = createGame({
    innings: 3,
    awayTeamName: "블루",
    homeTeamName: "레드",
  });
  return {
    roomCode: "ABC234",
    status: "lobby",
    actionOwner: "home",
    seats: { away: true, home: false },
    view: getGameView(state, "public"),
  } satisfies PartyRoomSnapshot;
}

describe("BaseballPartyScreen", () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders a public broadcast without either team's cards", async () => {
    const snapshot = partySnapshot();
    window.sessionStorage.setItem(
      partyInviteStorageKey("ABC234"),
      JSON.stringify({
        awayControllerUrl:
          "/baseball-game/party/ABC234/away#token=private-away-token",
        homeControllerUrl: "/baseball-game/party/ABC234/home",
      }),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ snapshot })));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const { container } = render(<BaseballPartyScreen roomCode="ABC234" />);

    expect(
      await screen.findByRole("region", { name: "개인 화면 연결" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "공용 경기 점수판 1회초" }),
    ).toBeVisible();
    expect(screen.getByText("개인기기 연결 대기")).toBeVisible();
    expect(screen.getAllByText("블루").length).toBeGreaterThan(0);
    expect(screen.getAllByText("레드").length).toBeGreaterThan(0);
    expect(screen.queryByText("공격 카드")).not.toBeInTheDocument();
    expect(screen.queryByText("수비 카드")).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("private-away-token");
    expect(
      container.querySelector(".bbg-party-field .bbg-stadium svg"),
    ).toHaveAttribute("viewBox", "0 0 900 700");

    fireEvent.click(screen.getAllByRole("button", { name: "링크 복사" })[0]);
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/baseball-game\/party\/ABC234\/away#token=private-away-token$/,
        ),
      ),
    );
  });
});
