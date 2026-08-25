import { describe, expect, it } from "vitest";

import { mutationOriginError, requestIp, safeNextPath } from "./request";

describe("Workbench 요청 경계", () => {
  it("등록된 앱의 내부 next 경로만 허용한다", () => {
    expect(safeNextPath("/what-should-eat?from=account#top")).toBe(
      "/what-should-eat?from=account#top",
    );
    expect(safeNextPath("/worldcup-prediction/archive")).toBe(
      "/worldcup-prediction/archive",
    );
    expect(safeNextPath("https://example.com")).toBe("/");
    expect(safeNextPath("//example.com")).toBe("/");
    expect(safeNextPath("/not-registered")).toBe("/");
  });

  it("변경 요청은 동일 Origin만 허용한다", async () => {
    const allowed = new Request("https://workbench.example/api/action", {
      headers: { origin: "https://workbench.example" },
    });
    const denied = new Request("https://workbench.example/api/action", {
      headers: { origin: "https://attacker.example" },
    });

    expect(mutationOriginError(allowed)).toBeNull();
    expect(mutationOriginError(denied)?.status).toBe(403);
  });

  it("프록시가 전달한 첫 IP만 사용한다", () => {
    const request = new Request("https://workbench.example", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });

    expect(requestIp(request)).toBe("203.0.113.7");
  });
});
