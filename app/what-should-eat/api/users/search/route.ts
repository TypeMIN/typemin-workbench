import { apiError } from "@/lib/what-should-eat/api";
import { getCurrentUser } from "@/lib/what-should-eat/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ParticipantSummary } from "@/lib/what-should-eat/types";

type SummaryRow = { id: number; login_id: string; display_name: string };

function toParticipantSummary(row: SummaryRow): ParticipantSummary {
  return {
    id: Number(row.id),
    loginId: row.login_id,
    displayName: row.display_name,
  };
}

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("로그인이 필요합니다.", 401);

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < 1 || query.length > 30) {
    return Response.json({ users: [] });
  }

  const supabase = getSupabaseAdmin();
  const columns = "id, login_id, display_name";
  const [idMatches, nameMatches] = await Promise.all([
    supabase
      .from("what_should_eat_users")
      .select(columns)
      .ilike("login_id", `${query.toLowerCase()}%`)
      .neq("id", currentUser.id)
      .order("login_id")
      .limit(8),
    supabase
      .from("what_should_eat_users")
      .select(columns)
      .ilike("display_name", `%${query}%`)
      .neq("id", currentUser.id)
      .order("login_id")
      .limit(8),
  ]);

  if (idMatches.error || nameMatches.error) {
    return apiError("사용자를 검색하지 못했습니다.", 500);
  }

  const uniqueUsers = new Map(
    [...(idMatches.data ?? []), ...(nameMatches.data ?? [])].map(
      (row) => [Number(row.id), row] as const,
    ),
  );
  const users = [...uniqueUsers.values()]
    .sort((left, right) => left.login_id.localeCompare(right.login_id))
    .slice(0, 8)
    .map(toParticipantSummary);

  return Response.json({ users });
}
