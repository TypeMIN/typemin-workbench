import { PITCH_TARGETS } from "../duel";
import { getActionOwner } from "../engine";
import { getPresentationDuration } from "../presentation";
import type { GameAction, GamePhase, GameState, TeamSide } from "../types";

export type TimedPhase = Extract<
  GamePhase,
  "awaiting_pitch" | "awaiting_swing" | "awaiting_card"
>;

export const DECISION_LIMIT_MS: Record<TimedPhase, number> = {
  awaiting_pitch: 30_000,
  awaiting_swing: 25_000,
  awaiting_card: 20_000,
};
export const SHOT_CLOCK_WARNING_MS = 10_000;
export const TEAM_TIMEOUTS_PER_GAME = 2;
export const TIMEOUT_EXTENSION_MS = 30_000;
export const RECONNECT_GRACE_MS = 60_000;
export const FORFEIT_AFTER_CONSECUTIVE_TIMEOUTS = 3;
// The waiting device learns about a commit one polling interval later, so the
// clock starts after that delay as well as after the replayed scene.
export const PRESENTATION_SYNC_BUFFER_MS = 1_500;
// In a v4 duel one side locking keeps the shared deadline, but the other side
// always keeps at least this long so a last-second lock is not an ambush.
export const MIN_DECISION_AFTER_LOCK_MS = 8_000;

export type MultiplayerClockState = {
  version: 1;
  revision: number;
  extensionMs: number;
  graceUsed: boolean;
  timeoutsRemaining: Record<TeamSide, number>;
  consecutiveTimeouts: Record<TeamSide, number>;
  lastTimeout: { revision: number; team: TeamSide } | null;
  forfeitedBy: TeamSide | null;
  /** Shared deadline carried across the locks of one v4 duel. */
  fixedDeadlineAt?: number | null;
};

export type ShotClockView = {
  startsAt: number | null;
  deadlineAt: number | null;
  serverNow: number;
  warningMs: number;
  owner: TeamSide | null;
  timeoutsRemaining: Record<TeamSide, number>;
  timeoutExtensionMs: number;
  graceActive: boolean;
  consecutiveTimeouts: Record<TeamSide, number>;
  lastTimeout: MultiplayerClockState["lastTimeout"];
  forfeitThreshold: number;
  forfeitedBy: TeamSide | null;
};

export function createClockState(revision: number): MultiplayerClockState {
  return {
    version: 1,
    revision,
    extensionMs: 0,
    graceUsed: false,
    timeoutsRemaining: {
      away: TEAM_TIMEOUTS_PER_GAME,
      home: TEAM_TIMEOUTS_PER_GAME,
    },
    consecutiveTimeouts: { away: 0, home: 0 },
    lastTimeout: null,
    forfeitedBy: null,
  };
}

export function resolveClockState(
  clock: MultiplayerClockState | null,
  revision: number,
): MultiplayerClockState {
  const base = clock ?? createClockState(revision);
  if (base.revision === revision) return base;
  return {
    ...base,
    revision,
    extensionMs: 0,
    graceUsed: false,
    fixedDeadlineAt: null,
  };
}

export function isTimedPhase(phase: GamePhase): phase is TimedPhase {
  return phase in DECISION_LIMIT_MS;
}

export function getClockWindow(
  state: GameState,
  revisionStartedAt: string,
  clock: MultiplayerClockState,
) {
  const owner = getActionOwner(state);
  const startedAt = Date.parse(revisionStartedAt);
  if (!owner || !isTimedPhase(state.phase) || !Number.isFinite(startedAt)) {
    return null;
  }
  const revisionEvents = state.eventLog.filter(
    (event) => event.revision === state.revision,
  );
  const startsAt =
    startedAt +
    getPresentationDuration(revisionEvents) +
    PRESENTATION_SYNC_BUFFER_MS;
  const baseDeadline =
    clock.fixedDeadlineAt ?? startsAt + DECISION_LIMIT_MS[state.phase];
  return {
    owner,
    startsAt: Math.min(startsAt, baseDeadline),
    deadlineAt: baseDeadline + clock.extensionMs,
  };
}

/** A v4 lock that leaves the same pitch open for the other side. */
export function continuesDuel(previous: GameState, next: GameState) {
  return (
    next.rulesetVersion === "pitch-duel-v4" &&
    previous.phase === "awaiting_pitch" &&
    (next.phase === "awaiting_pitch" || next.phase === "awaiting_swing")
  );
}

export function carriedDeadline(
  previousDeadline: number,
  now: number,
  timedOut: boolean,
) {
  return timedOut
    ? previousDeadline
    : Math.max(previousDeadline, now + MIN_DECISION_AFTER_LOCK_MS);
}

export function nextClockAfterCommit(
  clock: MultiplayerClockState,
  input: {
    actor: TeamSide;
    newRevision: number;
    timedOut: boolean;
    carryDeadlineAt?: number | null;
  },
): MultiplayerClockState {
  return {
    ...clock,
    revision: input.newRevision,
    extensionMs: 0,
    graceUsed: false,
    fixedDeadlineAt: input.carryDeadlineAt ?? null,
    consecutiveTimeouts: {
      ...clock.consecutiveTimeouts,
      [input.actor]: input.timedOut
        ? clock.consecutiveTimeouts[input.actor] + 1
        : 0,
    },
    lastTimeout: input.timedOut
      ? { revision: input.newRevision, team: input.actor }
      : clock.lastTimeout,
  };
}

export function chooseTimeoutAction(
  state: GameState,
  randomIndex: (size: number) => number,
): GameAction | null {
  if (state.phase === "awaiting_pitch") {
    return {
      type: "SELECT_PITCH",
      target: PITCH_TARGETS[randomIndex(PITCH_TARGETS.length)],
    };
  }
  if (state.phase === "awaiting_swing") {
    return { type: "SELECT_SWING", decision: "take" };
  }
  if (state.phase === "awaiting_card") return { type: "PASS_CARD_WINDOW" };
  return null;
}

export function canClaimForfeit(
  clock: MultiplayerClockState,
  claimant: TeamSide,
) {
  const opponent: TeamSide = claimant === "away" ? "home" : "away";
  return (
    clock.forfeitedBy === null &&
    clock.consecutiveTimeouts[opponent] >= FORFEIT_AFTER_CONSECUTIVE_TIMEOUTS
  );
}

export function buildShotClockView(input: {
  state: GameState;
  revisionStartedAt: string;
  clock: MultiplayerClockState;
  playing: boolean;
  now: number;
}): ShotClockView {
  const window = input.playing
    ? getClockWindow(input.state, input.revisionStartedAt, input.clock)
    : null;
  return {
    startsAt: window?.startsAt ?? null,
    deadlineAt: window?.deadlineAt ?? null,
    serverNow: input.now,
    warningMs: SHOT_CLOCK_WARNING_MS,
    owner: window?.owner ?? null,
    timeoutsRemaining: input.clock.timeoutsRemaining,
    timeoutExtensionMs: input.clock.extensionMs,
    graceActive: input.clock.graceUsed,
    consecutiveTimeouts: input.clock.consecutiveTimeouts,
    lastTimeout: input.clock.lastTimeout,
    forfeitThreshold: FORFEIT_AFTER_CONSECUTIVE_TIMEOUTS,
    forfeitedBy: input.clock.forfeitedBy,
  };
}
