import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGame } from "@/lib/baseball-game";
import type { GameEvent } from "@/lib/baseball-game/types";
import {
  BaseballAudio,
  BroadcastLineScore,
  usePresentation,
} from "./baseball-broadcast";

const CONFIG = {
  innings: 3 as const,
  awayTeamName: "이글스",
  homeTeamName: "트윈스",
};

describe("broadcast UI", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it("renders two team rows with inning and R/H/E/B columns", () => {
    const game = createGame(CONFIG);
    render(<BroadcastLineScore game={game} />);
    const score = screen.getByLabelText("이닝별 점수와 경기 기록");
    expect(score).toHaveTextContent("팀123456789RHEB");
    expect(score).toHaveTextContent("원정이글스0--------0000");
    expect(score).toHaveTextContent("홈트윈스---------0000");
  });

  it("persists mute and volume preferences", async () => {
    render(<BaseballAudio events={[]} />);
    const sound = await screen.findByRole("button", { name: "경기 음향 끄기" });
    fireEvent.click(sound);
    expect(window.localStorage.getItem("bbg-broadcast-sound-v1")).toBe("muted");
    fireEvent.change(screen.getByRole("slider", { name: "경기 음향 볼륨" }), {
      target: { value: "0.4" },
    });
    await waitFor(() =>
      expect(window.localStorage.getItem("bbg-broadcast-volume-v1")).toBe(
        "0.4",
      ),
    );
  });

  it("does not render full sound controls on a personal party device", () => {
    render(<BaseballAudio events={[]} mode="personal" />);
    expect(screen.queryByRole("button", { name: /경기 음향/ })).toBeNull();
  });

  it("clears the final presentation cue instead of covering the field", () => {
    vi.useFakeTimers();
    const pitchEvent: GameEvent = {
      sequence: 1,
      revision: 1,
      inning: 1,
      half: "top",
      kind: "pitch_result",
      summary: "스트라이크",
      face: "S",
      runs: 0,
      outsRecorded: 0,
      moves: [],
    };
    const { result } = renderHook(() => usePresentation([pitchEvent]));

    expect(result.current.cue?.type).toBe("pitch");
    act(() => vi.advanceTimersByTime(850));
    expect(result.current.cue).toBeUndefined();
  });
});
