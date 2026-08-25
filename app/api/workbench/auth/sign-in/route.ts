import { apiError, readJson } from "@/lib/what-should-eat/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  createWorkbenchSession,
  isValidLoginId,
  isValidPin,
  normalizeLoginId,
  takeRateLimit,
  toWorkbenchAccount,
} from "@/lib/workbench/auth";
import { mutationOriginError, requestIp } from "@/lib/workbench/request";
import { verifyPin } from "@/lib/workbench/security";

type SignInBody = { loginId?: string; pin?: string };

type LoginRow = {
  id: number;
  login_id: string;
  display_name: string;
  role: "member" | "owner";
  must_change_pin: boolean;
  pin_hash: string;
  locked_until: string | null;
  disabled_at: string | null;
};

export async function POST(request: Request) {
  const originError = mutationOriginError(request);
  if (originError) return originError;
  if (!(await takeRateLimit("sign_in", requestIp(request), 30, 15 * 60))) {
    return apiError(
      "로그인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      429,
    );
  }

  const body = await readJson<SignInBody>(request);
  const loginId = normalizeLoginId(body?.loginId ?? "");
  const pin = body?.pin ?? "";
  if (!isValidLoginId(loginId) || !isValidPin(pin)) {
    return apiError("ID 또는 PIN이 올바르지 않습니다.", 401);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("workbench_accounts")
    .select(
      "id, login_id, display_name, role, must_change_pin, pin_hash, locked_until, disabled_at",
    )
    .eq("login_id", loginId)
    .maybeSingle<LoginRow>();
  if (error) return apiError("로그인 상태를 확인하지 못했습니다.", 500);
  if (!data || data.disabled_at)
    return apiError("ID 또는 PIN이 올바르지 않습니다.", 401);

  if (data.locked_until && new Date(data.locked_until).getTime() > Date.now()) {
    return apiError("PIN 입력 실패로 15분간 잠긴 계정입니다.", 423);
  }

  if (!(await verifyPin(pin, data.pin_hash))) {
    const { data: lockedUntil } = await supabase.rpc(
      "workbench_record_login_failure",
      { p_account_id: data.id },
    );
    return apiError(
      lockedUntil
        ? "PIN 입력 실패로 계정이 15분간 잠겼습니다."
        : "ID 또는 PIN이 올바르지 않습니다.",
      lockedUntil ? 423 : 401,
    );
  }

  const { error: successError } = await supabase.rpc(
    "workbench_record_login_success",
    { p_account_id: data.id },
  );
  if (successError) return apiError("로그인 상태를 갱신하지 못했습니다.", 500);
  await createWorkbenchSession(Number(data.id));
  return Response.json({ account: toWorkbenchAccount(data) });
}
