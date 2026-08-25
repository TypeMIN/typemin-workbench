import { apiError, readJson } from "@/lib/what-should-eat/api";
import { getCurrentUser } from "@/lib/what-should-eat/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { mutationOriginError } from "@/lib/workbench/request";
import type {
  DecisionHistory,
  DuelComparison,
  PlaceCandidate,
  PreferenceResponse,
} from "@/lib/what-should-eat/types";

type CreateDecisionBody = {
  participantIds?: number[];
  place?: PlaceCandidate;
  comparisons?: DuelComparison[];
};

type DecisionRow = {
  id: number;
  place_id: string;
  place_name: string;
  category_name: string;
  distance_meters: number;
  address_name: string;
  road_address_name: string;
  place_url: string;
  latitude: number;
  longitude: number;
  decided_at: string;
};

type UserRow = {
  id: number;
  login_id: string;
  display_name: string;
};

export async function POST(request: Request) {
  const originError = mutationOriginError(request);
  if (originError) return originError;
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("로그인이 필요합니다.", 401);

  const body = await readJson<CreateDecisionBody>(request);
  const participantIds = [...new Set((body?.participantIds ?? []).map(Number))];
  const place = body?.place;
  const comparisons = body?.comparisons ?? [];

  if (!participantIds.includes(currentUser.id)) {
    return apiError("세션 진행자는 참가자에 포함되어야 합니다.");
  }
  if (
    !place ||
    !place.id ||
    !place.name ||
    !Number.isFinite(place.distanceMeters) ||
    !Number.isFinite(place.latitude) ||
    !Number.isFinite(place.longitude)
  ) {
    return apiError("최종 식당 정보를 확인해 주세요.");
  }
  if (
    comparisons.length > 20 ||
    comparisons.some(
      (comparison) =>
        !Number.isSafeInteger(comparison.round) ||
        comparison.round < 1 ||
        !comparison.winner?.id ||
        !comparison.winner.category ||
        !comparison.loser?.id ||
        !comparison.loser.category ||
        comparison.winner.id === comparison.loser.id,
    )
  ) {
    return apiError("A/B 선택 기록을 확인해 주세요.");
  }

  const supabase = getSupabaseAdmin();
  const { data: participants, error: participantError } = await supabase
    .from("what_should_eat_profiles")
    .select("account_id")
    .in("account_id", participantIds);
  if (participantError || participants?.length !== participantIds.length) {
    return apiError("참가자 정보를 확인해 주세요.");
  }

  const { data: decision, error: decisionError } = await supabase
    .from("what_should_eat_decisions")
    .insert({
      host_user_id: currentUser.id,
      place_id: place.id,
      place_name: place.name,
      category_name: place.category,
      distance_meters: Math.max(0, Math.round(place.distanceMeters)),
      address_name: place.address,
      road_address_name: place.roadAddress,
      place_url: place.placeUrl,
      latitude: place.latitude,
      longitude: place.longitude,
    })
    .select("id, decided_at")
    .single();
  if (decisionError || !decision)
    return apiError("결과를 저장하지 못했습니다.", 500);

  const { error: participationError } = await supabase
    .from("what_should_eat_decision_participants")
    .insert(
      participantIds.map((userId) => ({
        decision_id: decision.id,
        user_id: userId,
      })),
    );

  if (participationError) {
    await supabase
      .from("what_should_eat_decisions")
      .delete()
      .eq("id", decision.id);
    return apiError("참가자와 결과를 함께 저장하지 못했습니다.", 500);
  }

  if (comparisons.length > 0) {
    const { error: comparisonError } = await supabase
      .from("what_should_eat_comparisons")
      .insert(
        comparisons.map((comparison) => ({
          decision_id: decision.id,
          host_user_id: currentUser.id,
          round: comparison.round,
          winner_place_id: comparison.winner.id,
          winner_category_name: comparison.winner.category,
          loser_place_id: comparison.loser.id,
          loser_category_name: comparison.loser.category,
        })),
      );
    if (comparisonError) {
      await supabase
        .from("what_should_eat_decisions")
        .delete()
        .eq("id", decision.id);
      return apiError("A/B 선택 기록을 함께 저장하지 못했습니다.", 500);
    }
  }

  return Response.json(
    { decision: { id: Number(decision.id), decidedAt: decision.decided_at } },
    { status: 201 },
  );
}

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("로그인이 필요합니다.", 401);

  const supabase = getSupabaseAdmin();
  const { data: ownRows, error: ownError } = await supabase
    .from("what_should_eat_decision_participants")
    .select("decision_id")
    .eq("user_id", currentUser.id);
  if (ownError) return apiError("결정 이력을 불러오지 못했습니다.", 500);

  const decisionIds = (ownRows ?? []).map((row) => Number(row.decision_id));
  if (decisionIds.length === 0) return Response.json({ decisions: [] });

  const [
    { data: decisions, error: decisionError },
    { data: participantRows, error: rowError },
    { data: feedbackRows, error: feedbackError },
  ] = await Promise.all([
    supabase
      .from("what_should_eat_decisions")
      .select(
        "id, place_id, place_name, category_name, distance_meters, address_name, road_address_name, place_url, latitude, longitude, decided_at",
      )
      .in("id", decisionIds)
      .order("decided_at", { ascending: false }),
    supabase
      .from("what_should_eat_decision_participants")
      .select("decision_id, user_id")
      .in("decision_id", decisionIds),
    supabase
      .from("what_should_eat_place_feedback")
      .select("decision_id, response")
      .eq("user_id", currentUser.id)
      .in("decision_id", decisionIds),
  ]);

  if (decisionError || rowError || feedbackError) {
    return apiError("결정 이력을 불러오지 못했습니다.", 500);
  }

  const userIds = [
    ...new Set((participantRows ?? []).map((row) => Number(row.user_id))),
  ];
  const { data: users, error: userError } = await supabase
    .from("workbench_accounts")
    .select("id, login_id, display_name")
    .in("id", userIds);
  if (userError) return apiError("참가자 이력을 불러오지 못했습니다.", 500);

  const userMap = new Map(
    (users as UserRow[]).map((user) => [Number(user.id), user]),
  );
  const participantsByDecision = new Map<
    number,
    DecisionHistory["participants"]
  >();
  for (const row of participantRows ?? []) {
    const decisionId = Number(row.decision_id);
    const user = userMap.get(Number(row.user_id));
    if (!user) continue;
    const list = participantsByDecision.get(decisionId) ?? [];
    list.push({
      id: Number(user.id),
      loginId: user.login_id,
      displayName: user.display_name,
    });
    participantsByDecision.set(decisionId, list);
  }
  const feedbackByDecision = new Map(
    (feedbackRows ?? []).map((row) => [
      Number(row.decision_id),
      row.response as PreferenceResponse,
    ]),
  );

  const history: DecisionHistory[] = (decisions as DecisionRow[]).map(
    (decision) => ({
      id: Number(decision.id),
      place: {
        id: decision.place_id,
        name: decision.place_name,
        category: decision.category_name,
        distanceMeters: decision.distance_meters,
        address: decision.address_name,
        roadAddress: decision.road_address_name,
        placeUrl: decision.place_url,
        latitude: decision.latitude,
        longitude: decision.longitude,
      },
      participants: participantsByDecision.get(Number(decision.id)) ?? [],
      decidedAt: decision.decided_at,
      myFeedback: feedbackByDecision.get(Number(decision.id)) ?? null,
    }),
  );

  return Response.json({ decisions: history });
}
