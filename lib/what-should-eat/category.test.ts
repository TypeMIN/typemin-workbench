import { describe, expect, test } from "vitest";

import {
  categoryLevels,
  getCategoryParts,
  normalizeCategory,
} from "@/lib/what-should-eat/category";

describe("카카오 음식점 카테고리 정규화", () => {
  test("분류 뒤에 섞인 5단계 상호명을 제거한다", () => {
    const category = "음식점 > 한식 > 국수 > 칼국수 > 달인대보칼국수";

    expect(categoryLevels(category)).toEqual([
      "음식점",
      "한식",
      "국수",
      "칼국수",
    ]);
    expect(normalizeCategory(category)).toBe("음식점 > 한식 > 국수 > 칼국수");
    expect(getCategoryParts(category)).toEqual({
      major: "한식",
      detail: "국수 · 칼국수",
      label: "한식 · 국수 · 칼국수",
    });
  });

  test("음식점 카테고리가 아닌 값은 임의로 자르지 않는다", () => {
    expect(
      categoryLevels("문화시설 > 공연장 > 소극장 > 독립 > 실험극장"),
    ).toHaveLength(5);
  });
});
