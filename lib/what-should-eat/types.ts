export type Gender = "male" | "female" | "other" | "prefer_not_to_say";

export type AppUser = {
  id: number;
  loginId: string;
  displayName: string;
  birthYear: number;
  gender: Gender;
};

export type ParticipantSummary = Pick<
  AppUser,
  "id" | "loginId" | "displayName"
>;

export type PlaceCandidate = {
  id: string;
  name: string;
  category: string;
  distanceMeters: number;
  address: string;
  roadAddress: string;
  placeUrl: string;
  latitude: number;
  longitude: number;
};

export type PreferenceResponse = "liked" | "disliked" | "not_visited";

export type DuelComparison = {
  round: number;
  winner: Pick<PlaceCandidate, "id" | "category">;
  loser: Pick<PlaceCandidate, "id" | "category">;
};

export type PlaceFeedback = {
  id: number;
  place: PlaceCandidate;
  response: PreferenceResponse;
  source: "decision" | "manual";
  decisionId: number | null;
  updatedAt: string;
};

export type RegionResult = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

export type DecisionHistory = {
  id: number;
  place: PlaceCandidate;
  participants: ParticipantSummary[];
  decidedAt: string;
  myFeedback: PreferenceResponse | null;
};
