import { describe, expect, it } from "vitest";

import { createGame, transition } from "../engine";
import { commandToGameAction, parseMultiplayerCommand } from "./command";

describe("multiplayer commands", () => {
  it("accepts only the three public multiplayer command shapes", () => {
    expect(parseMultiplayerCommand({ type: "ROLL_DIE" })).toEqual({
      type: "ROLL_DIE",
    });
    expect(parseMultiplayerCommand({ type: "PASS_CARD_WINDOW" })).toEqual({
      type: "PASS_CARD_WINDOW",
    });
    expect(
      parseMultiplayerCommand({ type: "PLAY_CARD", cardInstanceId: "card-1" }),
    ).toEqual({ type: "PLAY_CARD", cardInstanceId: "card-1" });
    expect(
      parseMultiplayerCommand({ type: "PITCH_RESULT", face: "HR" }),
    ).toBeNull();
    expect(parseMultiplayerCommand({ type: "PLAY_CARD" })).toBeNull();
    expect(parseMultiplayerCommand(null)).toBeNull();
  });

  it("rolls the exact die required by the server state", () => {
    const pitch = createGame({
      innings: 3,
      awayTeamName: "원정",
      homeTeamName: "홈",
    });
    expect(commandToGameAction(pitch, { type: "ROLL_DIE" }, () => 0)).toEqual({
      type: "PITCH_RESULT",
      face: "S",
    });

    const contact = transition(pitch, { type: "PITCH_RESULT", face: "C" });
    if (!contact.ok) throw new Error("컨택 전환 실패");
    expect(
      commandToGameAction(contact.state, { type: "ROLL_DIE" }, () => 0.999999),
    ).toEqual({ type: "BATTING_RESULT", face: "HR" });
  });
});
