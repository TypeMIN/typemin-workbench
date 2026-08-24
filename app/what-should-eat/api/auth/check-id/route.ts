import { apiError } from "@/lib/what-should-eat/api";
import { isValidLoginId, normalizeLoginId } from "@/lib/what-should-eat/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const loginId = normalizeLoginId(
    new URL(request.url).searchParams.get("loginId") ?? "",
  );

  if (!isValidLoginId(loginId)) {
    return apiError("ID는 영문 소문자와 숫자로 3~20자여야 합니다.");
  }

  const { data, error } = await getSupabaseAdmin()
    .from("what_should_eat_users")
    .select("id")
    .eq("login_id", loginId)
    .maybeSingle<{ id: number }>();

  if (error) return apiError("ID 중복 여부를 확인하지 못했습니다.", 500);
  return Response.json({ available: !data });
}
