import { rollDie } from "../rules";
import type { DieKind, GameAction, GameState } from "../types";
import type { MultiplayerCommand } from "./types";

const PHASE_DIE: Partial<Record<GameState["phase"], DieKind>> = {
  awaiting_pitch: "pitch",
  awaiting_batting: "batting",
  awaiting_hit: "hit",
};

export function parseMultiplayerCommand(
  value: unknown,
): MultiplayerCommand | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.type === "ROLL_DIE") return { type: "ROLL_DIE" };
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
  if (command.type !== "ROLL_DIE") return command;
  const die = PHASE_DIE[state.phase];
  if (!die) return null;
  if (die === "pitch") {
    return { type: "PITCH_RESULT", face: rollDie("pitch", random) };
  }
  if (die === "batting") {
    return { type: "BATTING_RESULT", face: rollDie("batting", random) };
  }
  return { type: "HIT_RESULT", face: rollDie("hit", random) };
}
