import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import BaseballPartyJoin from "./baseball-party-join";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

describe("BaseballPartyJoin", () => {
  afterEach(() => {
    replace.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reconnects an existing player cookie directly to the player screen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ snapshot: { me: { id: "player" } } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    render(<BaseballPartyJoin roomCode="ABC234" />);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/baseball-game/party/ABC234/play"),
    );
  });
});
