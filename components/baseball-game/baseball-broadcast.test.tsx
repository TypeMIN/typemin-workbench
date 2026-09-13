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
  BaseballPlayReceipt,
  BroadcastLineScore,
  getBaseballPlayReceipt,
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
    const { result, rerender } = renderHook(
      ({ events }) => usePresentation(events),
      { initialProps: { events: [pitchEvent] } },
    );

    expect(result.current.cue?.type).toBe("pitch");
    act(() => vi.advanceTimersByTime(850));
    expect(result.current.cue).toEqual({ type: "call", call: "strike" });
    act(() => vi.advanceTimersByTime(600));
    expect(result.current.cue).toBeUndefined();

    rerender({ events: [{ ...pitchEvent }] });
    expect(result.current.cue).toBeUndefined();
    act(() => vi.advanceTimersByTime(1_450));
    expect(result.current.cue).toBeUndefined();
  });

  it("keeps pitcher, batter, card and ruling visible as one play receipt", () => {
    const game = createGame(CONFIG);
    game.phase = "awaiting_pitch";
    game.eventLog = [
      {
        sequence: 1,
        revision: 1,
        inning: 1,
        half: "top",
        kind: "card_play",
        summary: "수비 카드 · 보크",
        cardId: "BK",
        cardRole: "defense",
        runs: 0,
        outsRecorded: 0,
        moves: [],
      },
      {
        sequence: 2,
        revision: 2,
        inning: 1,
        half: "top",
        kind: "pitch_commit",
        summary: "투수가 코스를 선택했습니다.",
        runs: 0,
        outsRecorded: 0,
        moves: [],
      },
      {
        sequence: 3,
        revision: 3,
        inning: 1,
        half: "top",
        kind: "pitch_result",
        summary: "스트라이크 · 지켜보기 · 투수 승부 성공 · 스트라이크",
        face: "S",
        pitchTarget: "strike",
        swingDecision: "take",
        duelWinner: "pitcher",
        runs: 0,
        outsRecorded: 0,
        moves: [],
      },
      {
        sequence: 4,
        revision: 3,
        inning: 1,
        half: "top",
        kind: "count",
        summary: "스트라이크 1",
        runs: 0,
        outsRecorded: 0,
        moves: [],
      },
    ];

    expect(getBaseballPlayReceipt(game)).toEqual({
      pitcher: "스트라이크",
      batter: "지켜보기",
      cards: "보크",
      result: "스트라이크 1",
    });

    render(<BaseballPlayReceipt game={game} />);
    const receipt = screen.getByLabelText("현재 승부 진행 기록");
    expect(receipt).toHaveTextContent("투수스트라이크");
    expect(receipt).toHaveTextContent("타자지켜보기");
    expect(receipt).toHaveTextContent("카드보크");
    expect(receipt).toHaveTextContent("판정스트라이크 1");
  });

  it("shows a locked pitch without revealing the hidden location", () => {
    const game = createGame(CONFIG);
    game.phase = "awaiting_swing";
    game.eventLog = [
      {
        sequence: 1,
        revision: 1,
        inning: 1,
        half: "top",
        kind: "pitch_commit",
        summary: "투수가 코스를 선택했습니다.",
        runs: 0,
        outsRecorded: 0,
        moves: [],
      },
    ];

    expect(getBaseballPlayReceipt(game)).toEqual({
      pitcher: "선택 완료",
      batter: "판단 중",
      cards: "대기",
      result: "대기",
    });
  });

  it("starts a fresh receipt when a pre-pitch card follows a completed pitch", () => {
    const game = createGame(CONFIG);
    game.phase = "awaiting_card";
    game.cardWindow = {
      timing: "before_pitch",
      priorityOrder: ["offense", "defense"],
      priorityIndex: 1,
      respondingTo: null,
    };
    game.eventLog = [
      {
        sequence: 1,
        revision: 1,
        inning: 1,
        half: "top",
        kind: "pitch_commit",
        summary: "투수가 코스를 선택했습니다.",
        runs: 0,
        outsRecorded: 0,
        moves: [],
      },
      {
        sequence: 2,
        revision: 2,
        inning: 1,
        half: "top",
        kind: "pitch_result",
        summary: "스트라이크",
        face: "S",
        pitchTarget: "strike",
        swingDecision: "take",
        duelWinner: "pitcher",
        runs: 0,
        outsRecorded: 0,
        moves: [],
      },
      {
        sequence: 3,
        revision: 3,
        inning: 1,
        half: "top",
        kind: "card_play",
        summary: "수비 카드 · 1루 견제",
        cardId: "PO1",
        cardRole: "defense",
        runs: 0,
        outsRecorded: 0,
        moves: [],
      },
    ];

    expect(getBaseballPlayReceipt(game)).toEqual({
      pitcher: "대기",
      batter: "대기",
      cards: "1루 견제",
      result: "수비 카드 · 1루 견제",
    });
  });
});
