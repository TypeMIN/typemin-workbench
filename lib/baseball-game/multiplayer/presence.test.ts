import { describe, expect, it } from "vitest";

import { createGame, getGameView } from "../engine";
import { describeOpponentActivity } from "./activity";
import {
  SEAT_OFFLINE_AFTER_MS,
  getOpponentStatus,
  getSeatPresence,
  parseSeatVisibility,
} from "./presence";

const NOW = Date.parse("2026-10-13T00:00:00.000Z");

function seenAgo(ms: number, visibility: "visible" | "hidden" = "visible") {
  return { lastSeenAt: new Date(NOW - ms).toISOString(), visibility };
}

describe("seat presence", () => {
  it("is online right up to the offline threshold and offline after it", () => {
    expect(getSeatPresence(seenAgo(SEAT_OFFLINE_AFTER_MS), NOW)).toBe("online");
    expect(getSeatPresence(seenAgo(SEAT_OFFLINE_AFTER_MS + 1), NOW)).toBe(
      "offline",
    );
  });

  it("reports a hidden but recent tab as away", () => {
    expect(getSeatPresence(seenAgo(1_000, "hidden"), NOW)).toBe("away");
  });

  it("treats an unreadable timestamp as offline", () => {
    expect(
      getSeatPresence({ lastSeenAt: "nope", visibility: "visible" }, NOW),
    ).toBe("offline");
  });

  it("marks an empty opponent seat as absent", () => {
    expect(getOpponentStatus(null, NOW)).toEqual({
      presence: "absent",
      lastSeenAgoMs: null,
    });
    expect(getOpponentStatus(seenAgo(2_000), NOW)).toEqual({
      presence: "online",
      lastSeenAgoMs: 2_000,
    });
  });

  it("accepts only known visibility values", () => {
    expect(parseSeatVisibility("hidden")).toBe("hidden");
    expect(parseSeatVisibility("gone")).toBeNull();
  });
});

describe("opponent activity", () => {
  const online = { presence: "online", lastSeenAgoMs: 0 } as const;
  const view = getGameView(
    createGame({ innings: 3, awayTeamName: "원정", homeTeamName: "홈" }),
    "away",
  );

  it("describes the opponent pitcher choosing a sign", () => {
    expect(describeOpponentActivity(view, "home", online).title).toBe(
      "상대 투수가 사인을 고르는 중",
    );
  });

  it("describes the opponent batter once the pitch is locked", () => {
    const swing = { ...view, phase: "awaiting_swing" as const };
    expect(describeOpponentActivity(swing, "away", online).title).toBe(
      "상대 타자가 노림수를 정하는 중",
    );
  });

  it("names the card timing when the opponent holds a card window", () => {
    const card = {
      ...view,
      phase: "awaiting_card" as const,
      cardWindow: {
        timing: "after_batting" as const,
        priorityOrder: ["defense" as const],
        priorityIndex: 0,
        respondingTo: null,
      },
    };
    expect(describeOpponentActivity(card, "home", online).title).toBe(
      "상대 수비가 타구 직후 카드를 검토 중",
    );
  });

  it("prefers the offline state over any decision", () => {
    const result = describeOpponentActivity(view, "home", {
      presence: "offline",
      lastSeenAgoMs: 30_000,
    });
    expect(result.tone).toBe("offline");
    expect(result.title).toBe("상대 연결 끊김");
  });

  it("describes the opponent batter during a v4 pitch and their lock", () => {
    expect(describeOpponentActivity(view, "away", online).title).toBe(
      "상대 타자가 노림수를 정하는 중",
    );
    const locked = { ...view, batterLocked: true };
    expect(describeOpponentActivity(locked, "away", online).title).toBe(
      "상대 선택 완료",
    );
  });
});
