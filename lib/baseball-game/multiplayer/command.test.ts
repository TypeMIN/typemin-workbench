import { describe, expect, it } from "vitest";

import { createGame, transition } from "../engine";
import { commandToGameAction, parseMultiplayerCommand } from "./command";

describe("multiplayer commands", () => {
  it("accepts only the four public multiplayer command shapes", () => {
    expect(
      parseMultiplayerCommand({ type: "SELECT_PITCH", target: "strike" }),
    ).toEqual({
      type: "SELECT_PITCH",
      target: "strike",
    });
    expect(
      parseMultiplayerCommand({ type: "SELECT_SWING", decision: "take" }),
    ).toEqual({ type: "SELECT_SWING", decision: "take" });
    expect(parseMultiplayerCommand({ type: "PASS_CARD_WINDOW" })).toEqual({
      type: "PASS_CARD_WINDOW",
    });
    expect(
      parseMultiplayerCommand({ type: "PLAY_CARD", cardInstanceId: "card-1" }),
    ).toEqual({ type: "PLAY_CARD", cardInstanceId: "card-1" });
    expect(
      parseMultiplayerCommand({ type: "PITCH_RESULT", face: "HR" }),
    ).toBeNull();
    expect(parseMultiplayerCommand({ type: "ROLL_DIE" })).toBeNull();
    expect(parseMultiplayerCommand({ type: "PLAY_CARD" })).toBeNull();
    expect(parseMultiplayerCommand(null)).toBeNull();
  });

  it("maps private player choices directly to engine actions", () => {
    const pitch = createGame({
      innings: 3,
      awayTeamName: "원정",
      homeTeamName: "홈",
    });
    expect(
      commandToGameAction(pitch, {
        type: "SELECT_PITCH",
        target: "strike",
      }),
    ).toEqual({
      type: "SELECT_PITCH",
      target: "strike",
    });
    const locked = transition(pitch, {
      type: "SELECT_PITCH",
      target: "strike",
    });
    if (!locked.ok) throw new Error("투구 선택 실패");
    expect(
      commandToGameAction(locked.state, {
        type: "SELECT_SWING",
        decision: "swing",
      }),
    ).toEqual({ type: "SELECT_SWING", decision: "swing" });
  });
});
