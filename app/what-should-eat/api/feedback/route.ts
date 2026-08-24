import { apiError, readJson } from "@/lib/what-should-eat/api";
import { getCurrentUser } from "@/lib/what-should-eat/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  PlaceCandidate,
  PlaceFeedback,
  PreferenceResponse,
} from "@/lib/what-should-eat/types";

type FeedbackBody = {
  decisionId?: number;
  place?: PlaceCandidate;
  response?: PreferenceResponse;
};

type FeedbackRow = {
  id: number;
  decision_id: number | null;
  place_id: string;
  place_name: string;
  category_name: string;
  address_name: string;
  road_address_name: string;
  place_url: string;
  latitude: number;
  longitude: number;
  response: string;
  source: string;
  updated_at: string;
};

const RESPONSES = new Set<PreferenceResponse>([
  "liked",
  "disliked",
  "not_visited",
]);
const FEEDBACK_COLUMNS =
  "id, decision_id, place_id, place_name, category_name, address_name, road_address_name, place_url, latitude, longitude, response, source, updated_at";

function toPlaceFeedback(row: FeedbackRow): PlaceFeedback {
  return {
    id: Number(row.id),
    decisionId: row.decision_id === null ? null : Number(row.decision_id),
    place: {
      id: row.place_id,
      name: row.place_name,
      category: row.category_name,
      distanceMeters: 0,
      address: row.address_name,
      roadAddress: row.road_address_name,
      placeUrl: row.place_url,
      latitude: row.latitude,
      longitude: row.longitude,
    },
    response: row.response as PreferenceResponse,
    source: row.source as PlaceFeedback["source"],
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("로그인이 필요합니다.", 401);

  const { data, error } = await getSupabaseAdmin()
    .from("what_should_eat_place_feedback")
    .select(FEEDBACK_COLUMNS)
    .eq("user_id", currentUser.id)
    .order("updated_at", { ascending: false });
  if (error) return apiError("개인 평가를 불러오지 못했습니다.", 500);

  return Response.json({
    feedback: (data as FeedbackRow[]).map(toPlaceFeedback),
  });
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("로그인이 필요합니다.", 401);

  const body = await readJson<FeedbackBody>(request);
  const response = body?.response;
  const decisionId = Number(body?.decisionId);
  const hasDecision = Number.isSafeInteger(decisionId) && decisionId > 0;
  if (!response || !RESPONSES.has(response))
    return apiError("평가 항목을 확인해 주세요.");
  if (!hasDecision && response === "not_visited") {
    return apiError("추천 밖 식당에는 방문 평가만 남길 수 있습니다.");
  }

  const supabase = getSupabaseAdmin();
  let place = body?.place;
  let source: PlaceFeedback["source"] = "manual";

  if (hasDecision) {
    const { data: participation, error: participationError } = await supabase
      .from("what_should_eat_decision_participants")
      .select("decision_id")
      .eq("decision_id", decisionId)
      .eq("user_id", currentUser.id)
      .maybeSingle();
    if (participationError || !participation) {
      return apiError("참여한 선택에만 평가를 남길 수 있습니다.", 403);
    }

    const { data: decision, error: decisionError } = await supabase
      .from("what_should_eat_decisions")
      .select(
        "place_id, place_name, category_name, distance_meters, address_name, road_address_name, place_url, latitude, longitude",
      )
      .eq("id", decisionId)
      .maybeSingle();
    if (decisionError || !decision)
      return apiError("선택한 식당 정보를 찾지 못했습니다.", 404);
    place = {
      id: decision.place_id,
      name: decision.place_name,
      category: decision.category_name,
      distanceMeters: decision.distance_meters,
      address: decision.address_name,
      roadAddress: decision.road_address_name,
      placeUrl: decision.place_url,
      latitude: decision.latitude,
      longitude: decision.longitude,
    };
    source = "decision";
  }

  if (
    !place?.id ||
    !place.name ||
    !place.category ||
    !Number.isFinite(place.latitude) ||
    !Number.isFinite(place.longitude)
  ) {
    return apiError("평가할 식당 정보를 확인해 주세요.");
  }

  let existingQuery = supabase
    .from("what_should_eat_place_feedback")
    .select("id")
    .eq("user_id", currentUser.id);
  existingQuery = hasDecision
    ? existingQuery.eq("decision_id", decisionId)
    : existingQuery.eq("source", "manual").eq("place_id", place.id);
  const { data: existing, error: existingError } =
    await existingQuery.maybeSingle();
  if (existingError) return apiError("기존 평가를 확인하지 못했습니다.", 500);

  const values = {
    user_id: currentUser.id,
    decision_id: hasDecision ? decisionId : null,
    place_id: place.id,
    place_name: place.name,
    category_name: place.category,
    address_name: place.address,
    road_address_name: place.roadAddress,
    place_url: place.placeUrl,
    latitude: place.latitude,
    longitude: place.longitude,
    response,
    source,
    updated_at: new Date().toISOString(),
  };

  const query = existing
    ? supabase
        .from("what_should_eat_place_feedback")
        .update(values)
        .eq("id", existing.id)
    : supabase.from("what_should_eat_place_feedback").insert(values);
  const { data: saved, error: saveError } = await query
    .select(FEEDBACK_COLUMNS)
    .single();
  if (saveError || !saved) return apiError("평가를 저장하지 못했습니다.", 500);

  return Response.json(
    { feedback: toPlaceFeedback(saved as FeedbackRow) },
    { status: existing ? 200 : 201 },
  );
}
