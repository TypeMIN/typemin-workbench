import { describe, expect, test } from "vitest";

import { chooseDuel, startDuel } from "@/lib/what-should-eat/duel";
import type { PlaceCandidate } from "@/lib/what-should-eat/types";

function candidates(count: number): PlaceCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index + 1),
    name: `식당 ${index + 1}`,
    category: "음식점 > 한식",
    distanceMeters: index + 1,
    address: "",
    roadAddress: "",
    placeUrl: "",
    latitude: 37.5,
    longitude: 127,
  }));
}

describe("승자 유지 A/B 선택", () => {
  test.each([2, 3, 8])("후보 %i개는 후보 수 - 1번 선택하면 끝난다", (count) => {
    let state = startDuel(candidates(count));
    let result: PlaceCandidate | null = null;
    let choices = 0;

    while (state) {
      choices += 1;
      const next = chooseDuel(state, state.winner);
      state = next.state;
      result = next.result;
    }

    expect(choices).toBe(count - 1);
    expect(result?.id).toBe("1");
  });

  test("매 선택에서 고른 후보가 다음 비교에 남는다", () => {
    const state = startDuel(candidates(3));
    expect(state).not.toBeNull();
    const selected = state!.challenger;
    const next = chooseDuel(state!, selected);

    expect(next.state?.winner.id).toBe(selected.id);
    expect(next.state?.challenger.id).toBe("3");
  });
});
