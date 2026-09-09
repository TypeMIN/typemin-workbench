import { PITCH_TARGETS } from "../duel";
import type { GameAction, GameState } from "../types";
import type { MultiplayerCommand } from "./types";

export function parseMultiplayerCommand(
  value: unknown,
): MultiplayerCommand | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    record.type === "SELECT_PITCH" &&
    typeof record.target === "string" &&
    PITCH_TARGETS.includes(record.target as (typeof PITCH_TARGETS)[number])
  ) {
    return {
      type: "SELECT_PITCH",
      target: record.target as (typeof PITCH_TARGETS)[number],
    };
  }
  if (
    record.type === "SELECT_SWING" &&
    (record.decision === "swing" || record.decision === "take")
  ) {
    return { type: "SELECT_SWING", decision: record.decision };
  }
  if (record.type === "PASS_CARD_WINDOW") {
    return { type: "PASS_CARD_WINDOW" };
  }
  if (
    record.type === "PLAY_CARD" &&
    typeof record.cardInstanceId === "string" &&
    record.cardInstanceId.length > 0 &&
    record.cardInstanceId.length <= 100
  ) {
    return {
      type: "PLAY_CARD",
      cardInstanceId: record.cardInstanceId,
    };
  }
  return null;
}

export function commandToGameAction(
  state: GameState,
  command: MultiplayerCommand,
  random: () => number = Math.random,
): GameAction | null {
  void state;
  void random;
  return command;
}
