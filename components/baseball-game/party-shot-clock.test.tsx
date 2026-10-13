import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PartyShotClockView } from "@/lib/baseball-game/party/clock";

import { PartyShotClock } from "./party-shot-clock";

const SERVER_NOW = Date.parse("2026-10-14T00:00:00.000Z");
// The device runs 5s behind the server; the countdown must not care.
const DEVICE_SKEW_MS = -5_000;

function clock(overrides: Partial<PartyShotClockView>): PartyShotClockView {
  return {
    startsAt: SERVER_NOW,
    deadlineAt: SERVER_NOW + 30_000,
    serverNow: SERVER_NOW,
    warningMs: 10_000,
    lastTimeout: null,
    ...overrides,
  };
}

describe("PartyShotClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SERVER_NOW + DEVICE_SKEW_MS);
  });
  afterEach(() => vi.useRealTimers());

  it("counts down on the server clock and warns near the deadline", () => {
    render(<PartyShotClock clock={clock({})} label="결정" />);
    expect(screen.getByRole("timer")).toHaveAccessibleName(
      "결정 남은 시간 30초",
    );
    act(() => vi.advanceTimersByTime(21_000));
    const timer = screen.getByRole("timer");
    expect(timer).toHaveAccessibleName("결정 남은 시간 9초");
    expect(timer).toHaveAttribute("data-warning", "true");
  });

  it("holds full while the shared screen still plays the scene", () => {
    render(
      <PartyShotClock
        clock={clock({
          startsAt: SERVER_NOW + 4_000,
          deadlineAt: SERVER_NOW + 34_000,
        })}
        label="결정"
      />,
    );
    act(() => vi.advanceTimersByTime(3_000));
    const timer = screen.getByRole("timer");
    expect(timer).toHaveAttribute("data-paused", "true");
    expect(timer).toHaveAccessibleName("결정 남은 시간 30초");
  });

  it("renders nothing without a running decision", () => {
    const { container } = render(
      <PartyShotClock
        clock={clock({ startsAt: null, deadlineAt: null })}
        label="결정"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
