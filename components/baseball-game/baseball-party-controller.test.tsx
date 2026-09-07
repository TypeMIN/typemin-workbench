import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import BaseballPartyController from "./baseball-party-controller";

const { routerReplace } = vi.hoisted(() => ({ routerReplace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("BaseballPartyController", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    routerReplace.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("exchanges the away fragment token for an HTTP-only seat session", async () => {
    window.history.replaceState(
      null,
      "",
      "/baseball-game/party/ABC234/away#token=private-away-seat-token-1234567890",
    );
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        seat: "away",
        roomUrl: "/baseball-game/rooms/ABC234",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<BaseballPartyController roomCode="ABC234" team="away" />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/baseball-game/rooms/ABC234/seat",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(window.location.hash).toBe("");
    expect(routerReplace).toHaveBeenCalledWith("/baseball-game/rooms/ABC234");
  });

  it("claims the home seat through the normal join boundary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          snapshot: { seat: "home" },
        }),
      ),
    );

    render(<BaseballPartyController roomCode="ABC234" team="home" />);

    expect(
      screen.getByRole("heading", { name: "홈팀 개인 화면" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith("/baseball-game/rooms/ABC234"),
    );
  });
});
