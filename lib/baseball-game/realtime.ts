import "server-only";

import { createHmac } from "node:crypto";

import { after } from "next/server";

// A lost notification only delays a device until its next fallback poll, so
// the commit response never waits long on the broadcast.
const BROADCAST_TIMEOUT_MS = 800;
const TOPIC_PREFIX = "bbg:";
// 128 bits of the HMAC keeps topics unguessable while staying short.
const TOPIC_HEX_LENGTH = 32;

function realtimeConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  return url && secret ? { url, secret } : null;
}

/**
 * The topic is derived from the room id with a server secret, so only devices
 * that received a snapshot know it. Notifications carry revision numbers
 * only; every device still fetches its own private view afterwards.
 */
export function roomTopic(roomId: string) {
  const config = realtimeConfig();
  if (!config) return null;
  const digest = createHmac("sha256", config.secret)
    .update(`baseball-room:${roomId}`)
    .digest("hex");
  return `${TOPIC_PREFIX}${digest.slice(0, TOPIC_HEX_LENGTH)}`;
}

/**
 * Sends the notice once the response has gone out, so the acting device
 * never waits on the broadcast. Outside a request (tests, scripts) it is
 * sent right away instead.
 */
export function notifyRoomChanged(
  roomId: string,
  payload: { revision: number; roomRevision?: number },
) {
  const config = realtimeConfig();
  const topic = roomTopic(roomId);
  if (!config || !topic) return;
  const send = () => broadcast(config, topic, payload);
  try {
    after(send);
  } catch {
    void send();
  }
}

async function broadcast(
  config: { url: string; secret: string },
  topic: string,
  payload: { revision: number; roomRevision?: number },
) {
  try {
    const response = await fetch(`${config.url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: config.secret,
        authorization: `Bearer ${config.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ topic, event: "changed", payload }],
      }),
      signal: AbortSignal.timeout(BROADCAST_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(
        JSON.stringify({
          scope: "realtime",
          status: response.status,
          body: (await response.text()).slice(0, 200),
        }),
      );
    }
  } catch (error) {
    console.error(JSON.stringify({ scope: "realtime", error: String(error) }));
  }
}
