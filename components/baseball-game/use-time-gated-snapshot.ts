"use client";

import { useEffect, useState } from "react";

type GatedSnapshot = {
  presentationReadyAt: number;
  serverNow: number;
  canAct: boolean;
  view: { revision: number };
};

/**
 * A party device has no stadium, so it keeps showing the previous state
 * (and offers no decision) until the shared screen has played the latest
 * revision. The wait is measured on the server clock of each response, so
 * every poll shortens it without trusting the device clock.
 */
export function useTimeGatedSnapshot<Snapshot extends GatedSnapshot>(
  latest: Snapshot | null,
) {
  const [shown, setShown] = useState(latest);
  const [openedFor, setOpenedFor] = useState<Snapshot | null>(null);
  const waitingMs = latest
    ? Math.max(0, latest.presentationReadyAt - latest.serverNow)
    : 0;
  const ready = waitingMs === 0 || openedFor === latest;
  if (latest && (ready || !shown) && shown !== latest) setShown(latest);

  useEffect(() => {
    if (!latest || waitingMs === 0) return;
    const timer = window.setTimeout(() => setOpenedFor(latest), waitingMs);
    return () => window.clearTimeout(timer);
  }, [latest, waitingMs]);

  if (!latest) return { snapshot: null, waitingMs: 0 };
  if (ready || !shown) return { snapshot: latest, waitingMs: 0 };
  return { snapshot: { ...shown, canAct: false }, waitingMs };
}
