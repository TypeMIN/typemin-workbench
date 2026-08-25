import { apiError, readJson } from "@/lib/what-should-eat/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentAccount, toWorkbenchAccount } from "@/lib/workbench/auth";
import { mutationOriginError } from "@/lib/workbench/request";

type ProfileBody = { displayName?: string };

export async function PATCH(request: Request) {
  const originError = mutationOriginError(request);
  if (originError) return originError;
  const current = await getCurrentAccount();
  if (!current) return apiError("로그인이 필요합니다.", 401);

  const body = await readJson<ProfileBody>(request);
  const displayName = (body?.displayName ?? "").trim();
  if (displayName.length < 1 || displayName.length > 30) {
    return apiError("표시 이름은 1~30자로 입력해 주세요.");
  }

  const { data, error } = await getSupabaseAdmin()
    .from("workbench_accounts")
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq("id", current.id)
    .select("id, login_id, display_name, role, must_change_pin")
    .maybeSingle();
  if (error || !data) return apiError("표시 이름을 변경하지 못했습니다.", 500);
  return Response.json({ account: toWorkbenchAccount(data) });
}
