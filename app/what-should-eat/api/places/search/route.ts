import { apiError } from "@/lib/what-should-eat/api";
import { getCurrentUser } from "@/lib/what-should-eat/auth";
import { isMealCandidate } from "@/lib/what-should-eat/candidates";
import { searchRestaurants } from "@/lib/what-should-eat/kakao";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("로그인이 필요합니다.", 401);

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2)
    return apiError("식당 이름을 두 글자 이상 입력해 주세요.");

  try {
    const places = (await searchRestaurants(query)).filter(isMealCandidate);
    return Response.json({ places });
  } catch (error) {
    console.error("평가할 식당 검색 실패", error);
    return apiError(
      "식당을 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      502,
    );
  }
}
