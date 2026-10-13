import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ rpc }),
}));

import { GET } from "./route";

describe("baseball maintenance cron", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    rpc.mockReset();
  });

  it("removes rooms past the retention window", async () => {
    rpc.mockResolvedValue({ data: 3, error: null });
    const response = await GET(new Request("http://localhost/x"));
    expect(await response.json()).toEqual({ deleted: 3 });
    expect(rpc).toHaveBeenCalledWith("baseball_cleanup_expired_rooms", {
      p_retention_days: 7,
    });
  });

  it("requires the cron secret once one is configured", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const denied = await GET(new Request("http://localhost/x"));
    expect(denied.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();

    rpc.mockResolvedValue({ data: 0, error: null });
    const allowed = await GET(
      new Request("http://localhost/x", {
        headers: { authorization: "Bearer s3cret" },
      }),
    );
    expect(allowed.status).toBe(200);
  });
});
