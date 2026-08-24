import {
  createSession,
  hashPin,
  isValidLoginId,
  isValidPin,
  normalizeLoginId,
  toAppUser,
} from "@/lib/what-should-eat/auth";
import { apiError, readJson } from "@/lib/what-should-eat/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Gender } from "@/lib/what-should-eat/types";

type SignupBody = {
  loginId?: string;
  pin?: string;
  displayName?: string;
  birthYear?: number;
  gender?: Gender;
};

const GENDERS: Gender[] = ["male", "female"];

export async function POST(request: Request) {
  const body = await readJson<SignupBody>(request);
  if (!body) return apiError("가입 정보를 확인해 주세요.");

  const loginId = normalizeLoginId(body.loginId ?? "");
  const pin = body.pin ?? "";
  const displayName = (body.displayName ?? "").trim();
  const birthYear = Number(body.birthYear);
  const currentYear = new Date().getFullYear();

  if (!isValidLoginId(loginId)) {
    return apiError("ID는 영문 소문자와 숫자로 3~20자여야 합니다.");
  }
  if (!isValidPin(pin)) return apiError("PIN은 숫자 4~6자리여야 합니다.");
  if (displayName.length < 1 || displayName.length > 30) {
    return apiError("표시 이름은 1~30자로 입력해 주세요.");
  }
  if (
    !Number.isInteger(birthYear) ||
    birthYear < 1900 ||
    birthYear > currentYear
  ) {
    return apiError("출생연도를 확인해 주세요.");
  }
  if (!body.gender || !GENDERS.includes(body.gender)) {
    return apiError("성별 항목을 선택해 주세요.");
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("what_should_eat_users")
    .insert({
      login_id: loginId,
      pin_hash: await hashPin(pin),
      display_name: displayName,
      birth_year: birthYear,
      gender: body.gender,
    })
    .select("id, login_id, display_name, birth_year, gender")
    .single();

  if (error?.code === "23505") return apiError("이미 사용 중인 ID입니다.", 409);
  if (error || !data) return apiError("가입을 완료하지 못했습니다.", 500);

  await createSession(Number(data.id));
  return Response.json({ user: toAppUser(data) }, { status: 201 });
}
