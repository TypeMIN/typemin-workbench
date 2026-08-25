import { apiError, readJson } from "@/lib/what-should-eat/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  clearAllWorkbenchSessions,
  createWorkbenchSession,
  getCurrentAccount,
  isValidPin,
} from "@/lib/workbench/auth";
import { mutationOriginError } from "@/lib/workbench/request";
import { hashPin, verifyPin } from "@/lib/workbench/security";

type PinBody = { currentPin?: string; newPin?: string };

export async function POST(request: Request) {
  const originError = mutationOriginError(request);
  if (originError) return originError;
  const current = await getCurrentAccount();
  if (!current) return apiError("로그인이 필요합니다.", 401);

  const body = await readJson<PinBody>(request);
  const currentPin = body?.currentPin ?? "";
  const newPin = body?.newPin ?? "";
  if (!isValidPin(currentPin) || !isValidPin(newPin)) {
    return apiError("PIN은 숫자 4~6자리여야 합니다.");
  }
  if (currentPin === newPin)
    return apiError("새 PIN은 기존 PIN과 달라야 합니다.");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("workbench_accounts")
    .select("pin_hash")
    .eq("id", current.id)
    .maybeSingle();
  if (error || !data) return apiError("계정을 확인하지 못했습니다.", 500);
  if (!(await verifyPin(currentPin, data.pin_hash))) {
    return apiError("현재 PIN이 올바르지 않습니다.", 401);
  }

  const { error: updateError } = await supabase
    .from("workbench_accounts")
    .update({
      pin_hash: await hashPin(newPin),
      must_change_pin: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", current.id);
  if (updateError) return apiError("PIN을 변경하지 못했습니다.", 500);

  await clearAllWorkbenchSessions(current.id);
  await createWorkbenchSession(current.id);
  return Response.json({ changed: true });
}
