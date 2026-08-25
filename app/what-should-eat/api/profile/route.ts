import { apiError, readJson } from "@/lib/what-should-eat/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Gender } from "@/lib/what-should-eat/types";
import { getCurrentAccount } from "@/lib/workbench/auth";
import { mutationOriginError } from "@/lib/workbench/request";

type ProfileBody = { birthYear?: number; gender?: Gender };
const GENDERS: Gender[] = ["male", "female", "other", "prefer_not_to_say"];

export async function POST(request: Request) {
  const originError = mutationOriginError(request);
  if (originError) return originError;
  const account = await getCurrentAccount();
  if (!account) return apiError("로그인이 필요합니다.", 401);
  if (account.mustChangePin) return apiError("PIN 변경이 필요합니다.", 403);

  const body = await readJson<ProfileBody>(request);
  const birthYear = Number(body?.birthYear);
  const currentYear = new Date().getFullYear();
  if (
    !Number.isInteger(birthYear) ||
    birthYear < 1900 ||
    birthYear > currentYear
  ) {
    return apiError("출생연도를 확인해 주세요.");
  }
  if (!body?.gender || !GENDERS.includes(body.gender)) {
    return apiError("성별 항목을 선택해 주세요.");
  }

  const { error } = await getSupabaseAdmin()
    .from("what_should_eat_profiles")
    .upsert({
      account_id: account.id,
      birth_year: birthYear,
      gender: body.gender,
      updated_at: new Date().toISOString(),
    });
  if (error) return apiError("식사 프로필을 저장하지 못했습니다.", 500);
  return Response.json({
    user: {
      id: account.id,
      loginId: account.loginId,
      displayName: account.displayName,
      birthYear,
      gender: body.gender,
    },
  });
}
