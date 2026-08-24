import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "./server";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ kind: "server-client" })),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: vi.fn(() => []),
    set: vi.fn(),
  })),
}));

describe("server Supabase client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("서버 쿠키 저장소와 공개 설정으로 생성된다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "sb_publishable_example",
    );

    await createClient();

    expect(cookies).toHaveBeenCalledOnce();
    expect(createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_publishable_example",
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
  });
});
