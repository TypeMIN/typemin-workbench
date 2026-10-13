import { describe, expect, it } from "vitest";

import { parsePartyHostCommand } from "./http";

describe("parsePartyHostCommand", () => {
  it("accepts granting and revoking a co-host", () => {
    expect(
      parsePartyHostCommand({ type: "SET_CO_HOST", playerId: "player-1" }),
    ).toEqual({ type: "SET_CO_HOST", playerId: "player-1" });
    expect(
      parsePartyHostCommand({ type: "SET_CO_HOST", playerId: null }),
    ).toEqual({ type: "SET_CO_HOST", playerId: null });
  });

  it("rejects a co-host grant without a player", () => {
    expect(parsePartyHostCommand({ type: "SET_CO_HOST" })).toBeNull();
    expect(
      parsePartyHostCommand({ type: "SET_CO_HOST", playerId: 3 }),
    ).toBeNull();
  });
});
