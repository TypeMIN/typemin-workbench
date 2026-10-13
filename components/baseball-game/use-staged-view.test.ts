import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { GameEvent } from "@/lib/baseball-game/types";

import { useStagedView } from "./use-staged-view";

function event(revision: number): GameEvent {
  return {
    sequence: revision,
    revision,
    inning: 1,
    half: "top",
    kind: "pitch_result",
    summary: "",
    runs: 0,
    outsRecorded: 0,
    moves: [],
  };
}

function view(revision: number, events: number[], label = "") {
  return { revision, eventLog: events.map(event), label };
}

describe("useStagedView", () => {
  it("holds the previous view until the stadium finishes the new scenes", () => {
    const first = view(1, [1]);
    const { result, rerender } = renderHook(
      ({ latest }) => useStagedView(latest),
      { initialProps: { latest: first } },
    );
    act(() => result.current.onPresentedRevision(1));

    const second = view(2, [1, 2]);
    rerender({ latest: second });
    expect(result.current.view).toBe(first);
    expect(result.current.settled).toBe(false);

    act(() => result.current.onPresentedRevision(2));
    expect(result.current.view).toBe(second);
    expect(result.current.settled).toBe(true);
  });

  it("passes same-revision refreshes straight through", () => {
    const first = view(1, [1], "a");
    const { result, rerender } = renderHook(
      ({ latest }) => useStagedView(latest),
      { initialProps: { latest: first } },
    );
    act(() => result.current.onPresentedRevision(1));
    const refreshed = view(1, [1], "b");
    rerender({ latest: refreshed });
    expect(result.current.view).toBe(refreshed);
  });

  it("shows a revision that has no new scenes immediately", () => {
    const first = view(40, [40]);
    const { result, rerender } = renderHook(
      ({ latest }) => useStagedView(latest),
      { initialProps: { latest: first } },
    );
    act(() => result.current.onPresentedRevision(40));
    const rematch = view(41, []);
    rerender({ latest: rematch });
    expect(result.current.view).toBe(rematch);
  });

  it("resets when a new game starts below the presented revision", () => {
    const old = view(30, [30]);
    const { result, rerender } = renderHook(
      ({ latest }) => useStagedView(latest),
      { initialProps: { latest: old } },
    );
    act(() => result.current.onPresentedRevision(30));
    const restart = view(0, []);
    rerender({ latest: restart });
    expect(result.current.view).toBe(restart);
    const firstPitch = view(1, [1]);
    rerender({ latest: firstPitch });
    expect(result.current.view).toBe(restart);
  });
});
