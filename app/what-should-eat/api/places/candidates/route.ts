import { apiError, readJson } from "@/lib/what-should-eat/api";
import { getCurrentUser } from "@/lib/what-should-eat/auth";
import { searchNearbyRestaurants } from "@/lib/what-should-eat/kakao";
import { selectRecommendedCandidates } from "@/lib/what-should-eat/recommendation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Gender, PreferenceResponse } from "@/lib/what-should-eat/types";

type CandidateBody = {
  latitude?: number;
  longitude?: number;
  participantIds?: number[];
};

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  const body = await readJson<CandidateBody>(request);
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  const participantIds = [...new Set((body?.participantIds ?? []).map(Number))];

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return apiError("기준 위치의 위도를 확인해 주세요.");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return apiError("기준 위치의 경도를 확인해 주세요.");
  }
  if (
    participantIds.some(
      (participantId) =>
        !Number.isSafeInteger(participantId) || participantId < 1,
    )
  ) {
    return apiError("참가자 정보를 확인해 주세요.");
  }
  if (currentUser && !participantIds.includes(currentUser.id)) {
    return apiError("세션 진행자는 참가자에 포함되어야 합니다.");
  }

  if (participantIds.length === 0) {
    try {
      const { places, accuracyRanks } = await searchNearbyRestaurants(
        latitude,
        longitude,
      );
      const candidates = selectRecommendedCandidates(places, {
        participants: [],
        population: [],
        feedback: [],
        comparisons: [],
        recentPlaceIds: new Set(),
        visitedPlaceIds: new Set(),
        accuracyRanks,
      });
      return Response.json({ candidates });
    } catch (error) {
      console.error("음식점 후보 조회 실패", error);
      return apiError(
        "주변 음식점을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        502,
      );
    }
  }

  const supabase = getSupabaseAdmin();
  const { data: participants, error: participantError } = await supabase
    .from("what_should_eat_profiles")
    .select("account_id, birth_year, gender")
    .in("account_id", participantIds);
  if (participantError || participants?.length !== participantIds.length) {
    return apiError("참가자 정보를 확인해 주세요.");
  }

  const [
    participationResult,
    participantFeedbackResult,
    comparisonResult,
    populationFeedbackResult,
  ] = await Promise.all([
    supabase
      .from("what_should_eat_decision_participants")
      .select("decision_id")
      .in("user_id", participantIds),
    supabase
      .from("what_should_eat_place_feedback")
      .select("user_id, place_id, category_name, response, updated_at")
      .in("user_id", participantIds),
    supabase
      .from("what_should_eat_comparisons")
      .select("host_user_id, winner_category_name, loser_category_name")
      .in("host_user_id", participantIds)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("what_should_eat_place_feedback")
      .select("user_id, place_id, category_name, response, updated_at")
      .neq("response", "not_visited")
      .order("updated_at", { ascending: false })
      .limit(2000),
  ]);

  if (participationResult.error)
    return apiError("최근 선택 이력을 확인하지 못했습니다.", 500);
  if (
    participantFeedbackResult.error ||
    comparisonResult.error ||
    populationFeedbackResult.error
  ) {
    return apiError("추천 학습 데이터를 확인하지 못했습니다.", 500);
  }

  const decisionIds = [
    ...new Set(
      (participationResult.data ?? []).map((row) => Number(row.decision_id)),
    ),
  ];
  const recentPlaceIds = new Set<string>();
  const visitedPlaceIds = new Set<string>();

  if (decisionIds.length > 0) {
    const { data: decisions, error: decisionError } = await supabase
      .from("what_should_eat_decisions")
      .select("place_id, decided_at")
      .in("id", decisionIds);
    if (decisionError)
      return apiError("최근 선택 이력을 확인하지 못했습니다.", 500);
    const recentSince = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const decision of decisions ?? []) {
      visitedPlaceIds.add(decision.place_id);
      const decidedAt = new Date(decision.decided_at).getTime();
      if (decidedAt >= recentSince) recentPlaceIds.add(decision.place_id);
    }
  }

  const combinedFeedback = [
    ...(populationFeedbackResult.data ?? []),
    ...(participantFeedbackResult.data ?? []),
  ];
  const populationUserIds = [
    ...new Set(combinedFeedback.map((row) => Number(row.user_id))),
  ];
  const { data: population, error: populationError } =
    populationUserIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("what_should_eat_profiles")
          .select("account_id, birth_year, gender")
          .in("account_id", populationUserIds);
  if (populationError)
    return apiError("추천 집단 데이터를 확인하지 못했습니다.", 500);

  try {
    const { places, accuracyRanks } = await searchNearbyRestaurants(
      latitude,
      longitude,
    );
    const feedbackByIdentity = new Map(
      combinedFeedback.map((row) => [
        `${row.user_id}:${row.place_id}:${row.updated_at}`,
        {
          userId: Number(row.user_id),
          placeId: row.place_id,
          category: row.category_name,
          response: row.response as PreferenceResponse,
          updatedAt: row.updated_at,
        },
      ]),
    );
    const candidates = selectRecommendedCandidates(places, {
      participants: (participants ?? []).map((participant) => ({
        id: Number(participant.account_id),
        birthYear: participant.birth_year,
        gender: participant.gender as Gender,
      })),
      population: (population ?? []).map((member) => ({
        id: Number(member.account_id),
        birthYear: member.birth_year,
        gender: member.gender as Gender,
      })),
      feedback: [...feedbackByIdentity.values()],
      comparisons: (comparisonResult.data ?? []).map((comparison) => ({
        hostUserId: Number(comparison.host_user_id),
        winnerCategory: comparison.winner_category_name,
        loserCategory: comparison.loser_category_name,
      })),
      recentPlaceIds,
      visitedPlaceIds,
      accuracyRanks,
    });
    return Response.json({ candidates });
  } catch (error) {
    console.error("음식점 후보 조회 실패", error);
    return apiError(
      "주변 음식점을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      502,
    );
  }
}
