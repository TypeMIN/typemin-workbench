import { apiError, readJson } from "@/lib/what-should-eat/api";
import { getCurrentUser } from "@/lib/what-should-eat/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentAccount } from "@/lib/workbench/auth";
import { mutationOriginError } from "@/lib/workbench/request";

export async function GET() {
  const account = await getCurrentAccount();
  if (!account) return apiError("로그인이 필요합니다.", 401);
  if (account.mustChangePin) {
    return Response.json(
      { error: "PIN 변경이 필요합니다.", requiresPinChange: true },
      { status: 403 },
    );
  }
  const user = await getCurrentUser();
  return user
    ? Response.json({ user })
    : Response.json({ account, requiresProfile: true }, { status: 428 });
}

export async function PATCH(request: Request) {
  const originError = mutationOriginError(request);
  if (originError) return originError;
  const account = await getCurrentAccount();
  if (!account) return apiError("로그인이 필요합니다.", 401);
  const body = await readJson<{ displayName?: string }>(request);
  const displayName = (body?.displayName ?? "").trim();
  if (displayName.length < 1 || displayName.length > 30) {
    return apiError("표시 이름은 1~30자로 입력해 주세요.");
  }
  const { error } = await getSupabaseAdmin()
    .from("workbench_accounts")
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq("id", account.id);
  if (error) return apiError("표시 이름을 변경하지 못했습니다.", 500);
  const user = await getCurrentUser();
  return user
    ? Response.json({ user })
    : apiError("식사 프로필이 필요합니다.", 428);
}
