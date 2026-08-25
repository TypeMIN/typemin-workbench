import { getCurrentUser, toAppUser } from "@/lib/what-should-eat/auth";
import { apiError, readJson } from "@/lib/what-should-eat/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Gender } from "@/lib/what-should-eat/types";

type UpdateProfileBody = { displayName?: string };

type UserRow = {
  id: number;
  login_id: string;
  display_name: string;
  birth_year: number;
  gender: Gender;
};

export async function GET() {
  const user = await getCurrentUser();
  return user ? Response.json({ user }) : apiError("로그인이 필요합니다.", 401);
}

export async function PATCH(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("로그인이 필요합니다.", 401);

  const body = await readJson<UpdateProfileBody>(request);
  const displayName = (body?.displayName ?? "").trim();
  if (displayName.length < 1 || displayName.length > 30) {
    return apiError("표시 이름은 1~30자로 입력해 주세요.");
  }

  const { data, error } = await getSupabaseAdmin()
    .from("what_should_eat_users")
    .update({ display_name: displayName })
    .eq("id", currentUser.id)
    .select("id, login_id, display_name, birth_year, gender")
    .maybeSingle<UserRow>();

  if (error || !data) {
    return apiError("표시 이름을 변경하지 못했습니다.", 500);
  }

  return Response.json({ user: toAppUser(data) });
}
