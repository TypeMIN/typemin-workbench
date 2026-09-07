import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createGame, getGameView } from "@/lib/baseball-game/engine";
import type { PartyPublicSnapshot } from "@/lib/baseball-game/party/types";

import BaseballPartyScreen from "./baseball-party-screen";

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

function snapshot(): PartyPublicSnapshot {
  const state = createGame({
    innings: 3,
    awayTeamName: "블루",
    homeTeamName: "레드",
  });
  return {
    roomCode: "ABC234",
    status: "lobby",
    roomRevision: 2,
    actionOwner: "home",
    players: {
      away: [{ id: "away", nickname: "민수", team: "away", connected: true }],
      home: [{ id: "home", nickname: "지수", team: "home", connected: true }],
    },
    activeBatterId: null,
    activeDefenderId: null,
    view: getGameView(state, "public"),
    isHost: true,
  };
}

describe("BaseballPartyScreen", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders one common QR, two rosters and host controls without private hands", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ snapshot: snapshot() }));
    vi.stubGlobal("fetch", fetchMock);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { container } = render(<BaseballPartyScreen roomCode="ABC234" />);

    expect(
      await screen.findByRole("heading", { name: "선수를 초대하세요" }),
    ).toBeVisible();
    expect(screen.getByAltText("파티플레이 참가 QR 코드")).toBeVisible();
    expect(screen.getByText("카메라 없이 참가")).toBeVisible();
    expect(screen.getByText(/파티플레이를 선택하고 방 코드/)).toHaveTextContent(
      "ABC234",
    );
    expect(screen.getByRole("region", { name: "블루 참가자" })).toBeVisible();
    expect(screen.getByRole("region", { name: "레드 참가자" })).toBeVisible();
    expect(screen.getByRole("button", { name: "경기 시작" })).toBeEnabled();
    expect(container.textContent).not.toContain("instanceId");
    expect(JSON.stringify(snapshot().view)).not.toContain('"rng"');

    fireEvent.click(screen.getByRole("button", { name: "참가 링크 복사" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        expect.stringMatching(/\/party\/ABC234\/join$/),
      ),
    );
  });
});
