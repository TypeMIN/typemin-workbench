import { PRESENTATION_SYNC_BUFFER_MS } from "./multiplayer/shot-clock";
import { getPresentationDuration } from "./presentation";
import type { GameState } from "./types";

/**
 * The moment every screen has finished the current revision's scenes. Party
 * devices have no stadium of their own, so they wait for this before the
 * next decision instead of racing ahead of the shared screen.
 */
export function getPresentationReadyAt(
  state: Pick<GameState, "eventLog" | "revision">,
  revisionStartedAt: string,
) {
  const startedAt = Date.parse(revisionStartedAt);
  if (!Number.isFinite(startedAt)) return 0;
  const events = state.eventLog.filter(
    (event) => event.revision === state.revision,
  );
  if (events.length === 0) return startedAt;
  return (
    startedAt + getPresentationDuration(events) + PRESENTATION_SYNC_BUFFER_MS
  );
}
