import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTimeGatedSnapshot } from "./use-time-gated-snapshot";

function snapshot(revision: number, readyAt: number, serverNow: number) {
  return {
    presentationReadyAt: readyAt,
    serverNow,
    canAct: true,
    view: { revision },
  };
}

describe("useTimeGatedSnapshot", () => {
  afterEach(() => vi.useRealTimers());

  it("holds the previous state without decisions until the screen is done", () => {
    vi.useFakeTimers();
    const first = snapshot(1, 1_000, 2_000);
    const { result, rerender } = renderHook(
      ({ latest }) => useTimeGatedSnapshot(latest),
      { initialProps: { latest: first } },
    );
    expect(result.current.snapshot).toBe(first);

    const second = snapshot(2, 5_000, 3_000);
    rerender({ latest: second });
    expect(result.current.snapshot?.view.revision).toBe(1);
    expect(result.current.snapshot?.canAct).toBe(false);
    expect(result.current.waitingMs).toBe(2_000);

    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current.snapshot).toBe(second);
    expect(result.current.waitingMs).toBe(0);
  });

  it("opens at once when a later poll is already past the ready time", () => {
    const first = snapshot(1, 0, 1_000);
    const { result, rerender } = renderHook(
      ({ latest }) => useTimeGatedSnapshot(latest),
      { initialProps: { latest: first } },
    );
    rerender({ latest: snapshot(2, 5_000, 3_000) });
    const later = snapshot(2, 5_000, 5_100);
    rerender({ latest: later });
    expect(result.current.snapshot).toBe(later);
  });
});
