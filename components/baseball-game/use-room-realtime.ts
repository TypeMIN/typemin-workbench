"use client";

import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

// With live notices the poll only catches a missed one; without them the
// caller keeps its own fast cadence.
export const REALTIME_FALLBACK_POLL_MS = 3_000;

const realtimeConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

/**
 * Subscribes to a room's revision notices. A notice carries no game data;
 * it only tells this device to refetch its own private view right away.
 */
export function useRoomRealtime(topic: string | null, onChange: () => void) {
  const [connectedTopic, setConnectedTopic] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!topic || !realtimeConfigured) return;
    const client = createClient();
    const channel = client.channel(topic, {
      config: { broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "changed" }, () => onChangeRef.current());
    channel.subscribe((status) => {
      setConnectedTopic((current) =>
        status === "SUBSCRIBED" ? topic : current === topic ? null : current,
      );
    });
    return () => {
      void client.removeChannel(channel);
    };
  }, [topic]);

  return connectedTopic !== null && connectedTopic === topic;
}
