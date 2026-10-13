import { beforeEach, describe, expect, it } from "vitest";

import { RATE_LIMITS, resetRateLimits, takeRateLimit } from "./rate-limit";

describe("baseball rate limit", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit in a window and refuses the next request", () => {
    const { limit, windowMs } = RATE_LIMITS.action;
    for (let index = 0; index < limit; index += 1) {
      expect(takeRateLimit("action", "seat-a", 1_000)).toBe(true);
    }
    expect(takeRateLimit("action", "seat-a", 1_000)).toBe(false);
    expect(takeRateLimit("action", "seat-b", 1_000)).toBe(true);
    expect(takeRateLimit("action", "seat-a", 1_000 + windowMs)).toBe(true);
  });

  it("keeps scopes apart", () => {
    for (let index = 0; index < RATE_LIMITS.clock.limit; index += 1) {
      takeRateLimit("clock", "seat-a", 0);
    }
    expect(takeRateLimit("clock", "seat-a", 0)).toBe(false);
    expect(takeRateLimit("view", "seat-a", 0)).toBe(true);
  });
});
