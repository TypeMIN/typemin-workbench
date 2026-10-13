import type { GameState } from "../types";
import type { MultiplayerCommand } from "./types";

export function isDuelLock(command: MultiplayerCommand) {
  return command.type === "SELECT_PITCH" || command.type === "SELECT_SWING";
}

/**
 * Only the opponent's own lock may have moved the revision. Locks emit no
 * events, so any event after the client's revision means the pitch moved on
 * and the stale choice must not be applied to the next one.
 */
export function canRebaseDuelLock(
  state: GameState,
  input: { command: MultiplayerCommand; expectedRevision: number },
) {
  return (
    isDuelLock(input.command) &&
    state.rulesetVersion === "pitch-duel-v4" &&
    !state.eventLog.some((event) => event.revision > input.expectedRevision)
  );
}
