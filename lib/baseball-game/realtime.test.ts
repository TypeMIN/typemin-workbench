import { afterEach, describe, expect, it, vi } from "vitest";

import { notifyRoomChanged, roomTopic } from "./realtime";

describe("room realtime notices", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("stays off without Supabase configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(roomTopic("room-1")).toBeNull();
    await notifyRoomChanged("room-1", { revision: 3 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("derives a stable, unguessable topic per room", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret-a");
    const first = roomTopic("room-1");
    expect(first).toMatch(/^bbg:[0-9a-f]{32}$/);
    expect(roomTopic("room-1")).toBe(first);
    expect(roomTopic("room-2")).not.toBe(first);
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret-b");
    expect(roomTopic("room-1")).not.toBe(first);
  });

  it("broadcasts only revision numbers and never throws", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret-a");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await notifyRoomChanged("room-1", { revision: 7, roomRevision: 2 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.supabase.co/realtime/v1/api/broadcast");
    expect(JSON.parse(init.body)).toEqual({
      messages: [
        {
          topic: roomTopic("room-1"),
          event: "changed",
          payload: { revision: 7, roomRevision: 2 },
        },
      ],
    });

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(
      notifyRoomChanged("room-1", { revision: 8 }),
    ).resolves.toBeUndefined();
  });
});
