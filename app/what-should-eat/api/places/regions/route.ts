import { apiError } from "@/lib/what-should-eat/api";
import { getCurrentUser } from "@/lib/what-should-eat/auth";
import { searchRegions } from "@/lib/what-should-eat/kakao";

export async function GET(request: Request) {
  if (!(await getCurrentUser())) return apiError("로그인이 필요합니다.", 401);

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < 2 || query.length > 50) {
    return apiError("지역이나 장소를 두 글자 이상 입력해 주세요.");
  }

  try {
    return Response.json({ regions: await searchRegions(query) });
  } catch (error) {
    console.error("지역 검색 실패", error);
    return apiError(
      "지역을 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      502,
    );
  }
}
