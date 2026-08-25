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
import { hashPin } from "@/lib/workbench/security";

type SignUpBody = { loginId?: string; pin?: string; displayName?: string };

export async function POST(request: Request) {
  const originError = mutationOriginError(request);
  if (originError) return originError;
  if (!(await takeRateLimit("sign_up", requestIp(request), 5, 60 * 60))) {
    return apiError(
      "가입 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      429,
    );
  }

  const body = await readJson<SignUpBody>(request);
  const loginId = normalizeLoginId(body?.loginId ?? "");
  const pin = body?.pin ?? "";
  const displayName = (body?.displayName ?? "").trim();
  if (!isValidLoginId(loginId)) {
    return apiError("ID는 영문 소문자와 숫자로 3~20자여야 합니다.");
  }
  if (!isValidPin(pin)) return apiError("PIN은 숫자 4~6자리여야 합니다.");
  if (displayName.length < 1 || displayName.length > 30) {
    return apiError("표시 이름은 1~30자로 입력해 주세요.");
  }

  const { data, error } = await getSupabaseAdmin()
    .from("workbench_accounts")
    .insert({
      login_id: loginId,
      pin_hash: await hashPin(pin),
      display_name: displayName,
    })
    .select("id, login_id, display_name, role, must_change_pin")
    .maybeSingle();
  if (error?.code === "23505") return apiError("이미 사용 중인 ID입니다.", 409);
  if (error || !data) return apiError("계정을 만들지 못했습니다.", 500);

  await createWorkbenchSession(Number(data.id));
  return Response.json({ account: toWorkbenchAccount(data) }, { status: 201 });
}
