import { describe, expect, test } from "vitest";

import { hashPin, verifyPin } from "@/lib/what-should-eat/security";

describe("PIN 저장", () => {
  test("원문 대신 salt가 포함된 scrypt 해시를 저장하고 검증한다", async () => {
    const stored = await hashPin("1234");

    expect(stored).not.toContain("1234");
    expect(stored).toMatch(/^scrypt\$/);
    await expect(verifyPin("1234", stored)).resolves.toBe(true);
    await expect(verifyPin("9999", stored)).resolves.toBe(false);
  });
});
