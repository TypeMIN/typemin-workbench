import "server-only";

import { createHash } from "node:crypto";

/**
 * Per-instance fixed windows. They do not coordinate across serverless
 * instances, which is fine here: the goal is to cap a runaway or abusive
 * client cheaply without adding a database round trip to every poll.
 * Each limit sits well above what the client sends on its own.
 */
export const RATE_LIMITS = {
  // The fastest poll is every 250ms, about 40 per 10 seconds.
  view: { limit: 80, windowMs: 10_000 },
  // Heartbeats every 5s plus visibility changes.
  heartbeat: { limit: 30, windowMs: 60_000 },
  // A person rarely makes more than a couple of decisions a second.
  action: { limit: 20, windowMs: 10_000 },
  clock: { limit: 10, windowMs: 10_000 },
  rematch: { limit: 10, windowMs: 10_000 },
} as const;

export type RateLimitScope = keyof typeof RATE_LIMITS;

// Bounds memory if many distinct clients hit one instance.
const MAX_BUCKETS = 10_000;

const globalBuckets = globalThis as typeof globalThis & {
  __baseballRateBuckets?: Map<string, { count: number; resetAt: number }>;
};

function buckets() {
  globalBuckets.__baseballRateBuckets ??= new Map();
  return globalBuckets.__baseballRateBuckets;
}

export function takeRateLimit(
  scope: RateLimitScope,
  identity: string,
  now = Date.now(),
) {
  const { limit, windowMs } = RATE_LIMITS[scope];
  const key = `${scope}:${createHash("sha256").update(identity).digest("hex")}`;
  const map = buckets();
  if (map.size > MAX_BUCKETS) {
    for (const [entryKey, entry] of map) {
      if (entry.resetAt <= now) map.delete(entryKey);
    }
  }
  const bucket = map.get(key);
  if (!bucket || bucket.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function resetRateLimits() {
  buckets().clear();
}

export function rateLimitedResponse() {
  return Response.json(
    { error: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." },
    { status: 429, headers: { "retry-after": "5" } },
  );
}
