import { describe, expect, test } from "vitest";

import {
  isMealCandidate,
  selectCandidates,
} from "@/lib/what-should-eat/candidates";
import type { PlaceCandidate } from "@/lib/what-should-eat/types";

function place(id: string, category = "음식점 > 한식 > 백반"): PlaceCandidate {
  return {
    id,
    name: `식당 ${id}`,
    category,
    distanceMeters: Number(id.replace(/\D/g, "")) || 1,
    address: "서울",
    roadAddress: "서울",
    placeUrl: "",
    latitude: 37.5,
    longitude: 127,
  };
}

describe("후보 선정", () => {
  test("술집과 간식 단계가 포함된 장소는 제거한다", () => {
    expect(isMealCandidate(place("1", "음식점 > 술집 > 호프,요리주점"))).toBe(
      false,
    );
    expect(isMealCandidate(place("2", "음식점 > 간식 > 제과,베이커리"))).toBe(
      false,
    );
    expect(isMealCandidate(place("3", "음식점 > 패스트푸드 > 햄버거"))).toBe(
      true,
    );
  });

  test("신규 장소가 8곳 이상이면 최근 방문지를 포함하지 않는다", () => {
    const places = Array.from({ length: 10 }, (_, index) =>
      place(String(index + 1)),
    );
    const selected = selectCandidates(
      places,
      new Set(["1", "2"]),
      8,
      () => 0.5,
    );

    expect(selected).toHaveLength(8);
    expect(selected.map((candidate) => candidate.id)).not.toContain("1");
    expect(selected.map((candidate) => candidate.id)).not.toContain("2");
  });

  test("신규 장소가 부족할 때만 최근 방문지를 뒤에서 보충한다", () => {
    const places = Array.from({ length: 8 }, (_, index) =>
      place(String(index + 1)),
    );
    const selected = selectCandidates(
      places,
      new Set(["7", "8"]),
      8,
      () => 0.5,
    );

    expect(selected).toHaveLength(8);
    expect(selected.slice(0, 6).map((candidate) => candidate.id)).not.toContain(
      "7",
    );
    expect(new Set(selected.map((candidate) => candidate.id))).toEqual(
      new Set(places.map((candidate) => candidate.id)),
    );
  });
});
