import { describe, expect, it } from "vitest";

import {
  hashPin,
  hashSessionToken,
  newSessionToken,
  newTemporaryPin,
  verifyPin,
} from "./security";

describe("Workbench 인증 보안", () => {
  it("PIN 원문을 저장하지 않고 올바른 PIN만 검증한다", async () => {
    const hash = await hashPin("123456");

    expect(hash).not.toContain("123456");
    await expect(verifyPin("123456", hash)).resolves.toBe(true);
    await expect(verifyPin("654321", hash)).resolves.toBe(false);
  });

  it("세션 토큰은 충분한 엔트로피를 갖고 해시로 변환된다", () => {
    const first = newSessionToken();
    const second = newSessionToken();

    expect(first).not.toBe(second);
    expect(Buffer.from(first, "base64url")).toHaveLength(32);
    expect(hashSessionToken(first)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("임시 PIN은 암호학적 난수 기반 6자리 숫자다", () => {
    const pins = Array.from({ length: 20 }, () => newTemporaryPin());

    expect(pins.every((pin) => /^\d{6}$/.test(pin))).toBe(true);
    expect(new Set(pins).size).toBeGreaterThan(1);
  });
});
