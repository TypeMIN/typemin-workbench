import { afterEach, describe, expect, it, vi } from "vitest";

const limit = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ select: () => ({ limit }) }),
  }),
}));

import { GET } from "./route";

describe("health endpoint", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    limit.mockReset();
  });

  it("reports a reachable database", async () => {
    limit.mockResolvedValue({ error: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, database: "up" });
  });

  it("returns 503 and logs the cause when the database is down", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    limit.mockResolvedValue({ error: { code: "PGRST000", message: "down" } });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, database: "down" });
    expect(log.mock.calls[0][0]).toContain('"operation":"HEALTH_QUERY_FAILED"');
  });
});
