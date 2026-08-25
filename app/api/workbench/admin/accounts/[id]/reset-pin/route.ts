import { apiError } from "@/lib/what-should-eat/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  clearAllWorkbenchSessions,
  getCurrentAccount,
} from "@/lib/workbench/auth";
import { mutationOriginError } from "@/lib/workbench/request";
import { hashPin, newTemporaryPin } from "@/lib/workbench/security";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = mutationOriginError(request);
  if (originError) return originError;
  const current = await getCurrentAccount();
  if (!current) return apiError("로그인이 필요합니다.", 401);
  if (current.role !== "owner")
    return apiError("owner 권한이 필요합니다.", 403);

  const accountId = Number((await params).id);
  if (!Number.isSafeInteger(accountId) || accountId < 1) {
    return apiError("올바른 계정 ID가 아닙니다.");
  }
  if (accountId === current.id) {
    return apiError("내 PIN은 계정 관리 화면에서 변경해 주세요.");
  }

  const temporaryPin = newTemporaryPin();
  const { data, error } = await getSupabaseAdmin()
    .from("workbench_accounts")
    .update({
      pin_hash: await hashPin(temporaryPin),
      must_change_pin: true,
      failed_login_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId)
    .select("id")
    .maybeSingle();
  if (error || !data) return apiError("대상 계정을 찾지 못했습니다.", 404);
  await clearAllWorkbenchSessions(accountId);
  return Response.json({ temporaryPin });
}
