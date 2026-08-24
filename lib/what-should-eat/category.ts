const KAKAO_RESTAURANT_ROOT = "음식점";
const MAX_TRUSTED_KAKAO_LEVELS = 4;

export function categoryLevels(category: string) {
  const levels = category
    .split(">")
    .map((level) => level.trim())
    .filter(Boolean);

  return levels[0] === KAKAO_RESTAURANT_ROOT
    ? levels.slice(0, MAX_TRUSTED_KAKAO_LEVELS)
    : levels;
}

export function normalizeCategory(category: string) {
  return categoryLevels(category).join(" > ");
}

export function getCategoryParts(category: string) {
  const meaningful = categoryLevels(category).filter(
    (level) => level !== KAKAO_RESTAURANT_ROOT,
  );

  return {
    major: meaningful[0] || KAKAO_RESTAURANT_ROOT,
    detail:
      meaningful.slice(1).join(" · ") || meaningful[0] || KAKAO_RESTAURANT_ROOT,
    label: meaningful.join(" · ") || KAKAO_RESTAURANT_ROOT,
  };
}
