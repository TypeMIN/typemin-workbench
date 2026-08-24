import { describe, expect, it } from "vitest";
import { getSupabaseConfig, isSupabaseConfigured } from "./config";

describe("Supabase configuration", () => {
  const configuredEnvironment = {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  };

  it("두 공개 환경변수가 있으면 설정된 것으로 판단한다", () => {
    expect(isSupabaseConfigured(configuredEnvironment)).toBe(true);
    expect(getSupabaseConfig(configuredEnvironment)).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_example",
    });
  });

  it("사용 시점에 누락된 환경변수를 설명한다", () => {
    expect(isSupabaseConfigured({})).toBe(false);
    expect(() => getSupabaseConfig({})).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });
});
