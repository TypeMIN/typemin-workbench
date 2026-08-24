import {
  createSession,
  normalizeLoginId,
  toAppUser,
  verifyPin,
} from "@/lib/what-should-eat/auth";
import { apiError, readJson } from "@/lib/what-should-eat/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Gender } from "@/lib/what-should-eat/types";

type LoginBody = { loginId?: string; pin?: string };
type LoginRow = {
  id: number;
  login_id: string;
  pin_hash: string;
  display_name: string;
  birth_year: number;
  gender: Gender;
};

export async function POST(request: Request) {
  const body = await readJson<LoginBody>(request);
  if (!body) return apiError("로그인 정보를 확인해 주세요.");

  const supabase = getSupabaseAdmin();
  const { data: user, error } = await supabase
    .from("what_should_eat_users")
    .select("id, login_id, pin_hash, display_name, birth_year, gender")
    .eq("login_id", normalizeLoginId(body.loginId ?? ""))
    .maybeSingle<LoginRow>();

  if (error) return apiError("로그인 정보를 확인하지 못했습니다.", 500);
  if (!user || !(await verifyPin(body.pin ?? "", user.pin_hash))) {
    return apiError("ID 또는 PIN이 올바르지 않습니다.", 401);
  }

  await createSession(Number(user.id));
  return Response.json({ user: toAppUser(user) });
}
