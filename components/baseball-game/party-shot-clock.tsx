"use client";

import { useEffect, useState } from "react";

import type { PartyShotClockView } from "@/lib/baseball-game/party/clock";

const CLOCK_REFRESH_MS = 200;

/**
 * Counts down against the server's deadline. The offset is taken when the
 * clock mounts, so callers key it by deadline and mount it with a fresh
 * snapshot; the ring holds full until the shared screen's scene ends.
 */
export function PartyShotClock({
  clock,
  label,
}: {
  clock: PartyShotClockView;
  label: string;
}) {
  const [offsetMs] = useState(() => clock.serverNow - Date.now());
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Date.now() + offsetMs),
      CLOCK_REFRESH_MS,
    );
    return () => window.clearInterval(timer);
  }, [offsetMs]);

  if (clock.startsAt === null || clock.deadlineAt === null) return null;
  const total = Math.max(1, clock.deadlineAt - clock.startsAt);
  const paused = now < clock.startsAt;
  const remaining = paused
    ? total
    : Math.min(total, Math.max(0, clock.deadlineAt - now));
  const seconds = Math.ceil(remaining / 1_000);
  const warning = !paused && remaining <= clock.warningMs;

  return (
    <div
      aria-label={`${label} 남은 시간 ${seconds}초`}
      className="bbg-party-clock"
      data-paused={paused}
      data-warning={warning}
      role="timer"
      style={{ "--clock-progress": remaining / total } as React.CSSProperties}
    >
      <svg aria-hidden="true" viewBox="0 0 40 40">
        <circle className="is-track" cx="20" cy="20" r="17" />
        <circle className="is-fill" cx="20" cy="20" pathLength="1" r="17" />
      </svg>
      <strong>{seconds}</strong>
    </div>
  );
}
