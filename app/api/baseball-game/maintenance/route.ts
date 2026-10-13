import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { storageFailure } from "@/lib/supabase/log";

export const dynamic = "force-dynamic";

// A week after expiry nobody can rejoin or replay a room, so its rows go.
const ROOM_RETENTION_DAYS = 7;

/**
 * Daily Vercel cron. With CRON_SECRET configured only Vercel may call it;
 * without one it is still harmless, since it only removes expired rooms.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json(
      { error: "허용되지 않은 요청입니다." },
      { status: 401 },
    );
  }
  try {
    const { data, error } = await getSupabaseAdmin().rpc(
      "baseball_cleanup_expired_rooms",
      { p_retention_days: ROOM_RETENTION_DAYS },
    );
    if (error) throw storageFailure("ROOM_CLEANUP_FAILED", error);
    return Response.json(
      { deleted: data ?? 0 },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "정리 작업에 실패했습니다." },
      { status: 500 },
    );
  }
}
