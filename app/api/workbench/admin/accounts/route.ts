import { apiError } from "@/lib/what-should-eat/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentAccount } from "@/lib/workbench/auth";

export async function GET() {
  const current = await getCurrentAccount();
  if (!current) return apiError("로그인이 필요합니다.", 401);
  if (current.role !== "owner")
    return apiError("owner 권한이 필요합니다.", 403);

  const { data, error } = await getSupabaseAdmin()
    .from("workbench_accounts")
    .select(
      "id, login_id, display_name, role, must_change_pin, created_at, last_login_at, locked_until, disabled_at",
    )
    .order("created_at", { ascending: true });
  if (error) return apiError("계정 목록을 불러오지 못했습니다.", 500);

  return Response.json({
    accounts: data.map((account) => ({
      id: Number(account.id),
      loginId: account.login_id,
      displayName: account.display_name,
      role: account.role,
      mustChangePin: account.must_change_pin,
      createdAt: account.created_at,
      lastLoginAt: account.last_login_at,
      lockedUntil: account.locked_until,
      disabledAt: account.disabled_at,
    })),
  });
}
