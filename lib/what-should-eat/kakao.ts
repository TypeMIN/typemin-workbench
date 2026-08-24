import "server-only";

import { normalizeCategory } from "@/lib/what-should-eat/category";
import type { PlaceCandidate, RegionResult } from "@/lib/what-should-eat/types";

type KakaoPlace = {
  id: string;
  place_name: string;
  category_name: string;
  distance: string;
  address_name: string;
  road_address_name: string;
  place_url: string;
  x: string;
  y: string;
};

type KakaoResponse = {
  documents: KakaoPlace[];
  meta: { is_end: boolean };
};

function getKakaoKey() {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) throw new Error("카카오 REST API 키가 설정되지 않았습니다.");
  return key;
}

async function requestKakao(path: string, params: URLSearchParams) {
  const response = await fetch(`https://dapi.kakao.com${path}?${params}`, {
    headers: { Authorization: `KakaoAK ${getKakaoKey()}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`카카오 장소 조회에 실패했습니다. (${response.status})`);
  }

  return (await response.json()) as KakaoResponse;
}

function toCandidate(place: KakaoPlace): PlaceCandidate {
  return {
    id: place.id,
    name: place.place_name,
    category: normalizeCategory(place.category_name),
    distanceMeters: Number(place.distance || 0),
    address: place.address_name,
    roadAddress: place.road_address_name,
    placeUrl: place.place_url,
    latitude: Number(place.y),
    longitude: Number(place.x),
  };
}

export async function searchNearbyRestaurants(
  latitude: number,
  longitude: number,
) {
  const places: PlaceCandidate[] = [];

  for (let page = 1; page <= 3; page += 1) {
    const params = new URLSearchParams({
      category_group_code: "FD6",
      x: String(longitude),
      y: String(latitude),
      radius: "1000",
      sort: "distance",
      page: String(page),
      size: "15",
    });
    const result = await requestKakao("/v2/local/search/category.json", params);
    places.push(...result.documents.map(toCandidate));
    if (result.meta.is_end) break;
  }

  return places;
}

export async function searchRegions(query: string): Promise<RegionResult[]> {
  const params = new URLSearchParams({ query, size: "10" });
  const result = await requestKakao("/v2/local/search/keyword.json", params);

  return result.documents.map((place) => ({
    id: place.id,
    name: place.place_name,
    address: place.road_address_name || place.address_name,
    latitude: Number(place.y),
    longitude: Number(place.x),
  }));
}

export async function searchRestaurants(
  query: string,
): Promise<PlaceCandidate[]> {
  const params = new URLSearchParams({
    query,
    category_group_code: "FD6",
    size: "10",
  });
  const result = await requestKakao("/v2/local/search/keyword.json", params);
  return result.documents.map(toCandidate);
}
