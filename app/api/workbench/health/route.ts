import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { storageFailure } from "@/lib/supabase/log";

export const dynamic = "force-dynamic";

/**
 * Called by the daily Vercel cron so the Supabase project never idles into a
 * pause, and usable as an uptime probe. It reveals nothing but reachability.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    const { error } = await getSupabaseAdmin()
      .from("baseball_games")
      .select("id")
      .limit(1);
    if (error) throw storageFailure("HEALTH_QUERY_FAILED", error);
    return Response.json(
      { ok: true, database: "up", latencyMs: Date.now() - startedAt },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false, database: "down" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
