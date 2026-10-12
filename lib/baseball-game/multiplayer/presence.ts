import type { TeamSide } from "../types";

export const SEAT_HEARTBEAT_INTERVAL_MS = 5_000;
// Three missed heartbeats, so one slow request never flips a seat to offline.
export const SEAT_OFFLINE_AFTER_MS = 15_000;

export const SEAT_VISIBILITIES = ["visible", "hidden"] as const;

export type SeatVisibility = (typeof SEAT_VISIBILITIES)[number];
export type SeatPresence = "online" | "away" | "offline";

export type StoredSeatPresence = {
  lastSeenAt: string;
  visibility: SeatVisibility;
};

export type SeatPresenceMap = Record<TeamSide, StoredSeatPresence | null>;

export type OpponentStatus = {
  presence: SeatPresence | "absent";
  lastSeenAgoMs: number | null;
};

export function parseSeatVisibility(value: unknown): SeatVisibility | null {
  return SEAT_VISIBILITIES.includes(value as SeatVisibility)
    ? (value as SeatVisibility)
    : null;
}

export function getSeatPresence(
  seat: StoredSeatPresence,
  now: number,
): SeatPresence {
  const lastSeen = Date.parse(seat.lastSeenAt);
  if (!Number.isFinite(lastSeen) || now - lastSeen > SEAT_OFFLINE_AFTER_MS) {
    return "offline";
  }
  return seat.visibility === "hidden" ? "away" : "online";
}

export function getOpponentStatus(
  seat: StoredSeatPresence | null,
  now: number,
): OpponentStatus {
  if (!seat) return { presence: "absent", lastSeenAgoMs: null };
  const lastSeen = Date.parse(seat.lastSeenAt);
  return {
    presence: getSeatPresence(seat, now),
    lastSeenAgoMs: Number.isFinite(lastSeen)
      ? Math.max(0, now - lastSeen)
      : null,
  };
}
