import { getPendingOwners } from "../engine";
import {
  DECISION_LIMIT_MS,
  PRESENTATION_SYNC_BUFFER_MS,
  SHOT_CLOCK_WARNING_MS,
  carriedDeadline,
  continuesDuel,
  isTimedPhase,
} from "../multiplayer/shot-clock";
import { getPresentationDuration } from "../presentation";
import type { GameState, TeamSide } from "../types";
import type { PartyClockState, PartyRoomRecord } from "./types";

export type PartyClockWindow = { startsAt: number; deadlineAt: number };

export type PartyShotClockView = {
  startsAt: number | null;
  deadlineAt: number | null;
  serverNow: number;
  warningMs: number;
  lastTimeout: PartyClockState["lastTimeout"];
};

type ClockRoom = Pick<
  PartyRoomRecord,
  "status" | "state" | "revisionStartedAt" | "partyState"
>;

function currentClock(room: ClockRoom) {
  const clock = room.partyState.clock;
  return clock && clock.revision === room.state.revision ? clock : null;
}

export function getPartyClockWindow(room: ClockRoom): PartyClockWindow | null {
  const startedAt = Date.parse(room.revisionStartedAt);
  if (
    room.status !== "playing" ||
    !isTimedPhase(room.state.phase) ||
    getPendingOwners(room.state).length === 0 ||
    !Number.isFinite(startedAt)
  ) {
    return null;
  }
  const clock = currentClock(room);
  const events = room.state.eventLog.filter(
    (event) => event.revision === room.state.revision,
  );
  const presentedAt =
    startedAt + getPresentationDuration(events) + PRESENTATION_SYNC_BUFFER_MS;
  const startsAt = Math.max(presentedAt, clock?.anchorAt ?? 0);
  const deadlineAt =
    clock?.fixedDeadlineAt ?? startsAt + DECISION_LIMIT_MS[room.state.phase];
  return { startsAt: Math.min(startsAt, deadlineAt), deadlineAt };
}

/** A resume or a skipped player gives the new decider a full clock. */
export function restartPartyClock(
  room: ClockRoom,
  now: number,
): PartyClockState {
  return {
    revision: room.state.revision,
    anchorAt: now,
    fixedDeadlineAt: null,
    lastTimeout: room.partyState.clock?.lastTimeout ?? null,
  };
}

export function nextPartyClock(
  room: ClockRoom,
  next: GameState,
  input: { now: number; timedOutTeam: TeamSide | null },
): PartyClockState {
  const window = getPartyClockWindow(room);
  return {
    revision: next.revision,
    anchorAt: null,
    fixedDeadlineAt:
      window && continuesDuel(room.state, next)
        ? carriedDeadline(
            window.deadlineAt,
            input.now,
            Boolean(input.timedOutTeam),
          )
        : null,
    lastTimeout: input.timedOutTeam
      ? { revision: next.revision, team: input.timedOutTeam }
      : (room.partyState.clock?.lastTimeout ?? null),
  };
}

export function buildPartyShotClockView(
  room: ClockRoom,
  now: number,
): PartyShotClockView {
  const window = getPartyClockWindow(room);
  return {
    startsAt: window?.startsAt ?? null,
    deadlineAt: window?.deadlineAt ?? null,
    serverNow: now,
    warningMs: SHOT_CLOCK_WARNING_MS,
    lastTimeout: room.partyState.clock?.lastTimeout ?? null,
  };
}
