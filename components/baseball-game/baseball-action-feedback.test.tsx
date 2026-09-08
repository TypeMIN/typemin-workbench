import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BaseballActionFeedback,
  useAdaptiveGamePolling,
  useBaseballActionFeedback,
} from "./baseball-action-feedback";

function Harness() {
  const receipt = useBaseballActionFeedback();
  return (
    <>
      <button
        onClick={() =>
          receipt.show({
            status: "pending",
            title: "투구 판정 요청 중",
            detail: "서버 응답을 기다리고 있습니다.",
          })
        }
      >
        요청
      </button>
      <button
        onClick={() =>
          receipt.show({ status: "success", title: "투구 반영 완료" })
        }
      >
        완료
      </button>
      <BaseballActionFeedback feedback={receipt.feedback} />
    </>
  );
}

describe("BaseballActionFeedback", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps pending feedback visible and clears a success receipt", () => {
    vi.useFakeTimers();
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "요청" }));
    expect(screen.getByRole("status")).toHaveTextContent("투구 판정 요청 중");
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByRole("status")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    expect(screen.getByRole("status")).toHaveTextContent("투구 반영 완료");
    act(() => vi.advanceTimersByTime(2_400));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("never overlaps polling requests when a response is slow", async () => {
    vi.useFakeTimers();
    let finish: (() => void) | undefined;
    const load = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    function PollingHarness() {
      useAdaptiveGamePolling(load, { activeMs: 550 });
      return null;
    }

    render(<PollingHarness />);
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => finish?.());
    await act(async () => vi.advanceTimersByTime(550));
    expect(load).toHaveBeenCalledTimes(2);
  });
});
