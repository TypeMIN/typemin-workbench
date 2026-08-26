export const WORKBENCH_APPS = [
  {
    name: "오늘 뭐 먹지?",
    emoji: "🍽️",
    keywords: ["메뉴 선택", "장소 추천"],
    href: "/what-should-eat",
    status: "available",
    accent: "meal",
  },
  {
    name: "월드컵 예측 내기",
    emoji: "⚽",
    keywords: ["예측 결과", "점수판"],
    href: "/worldcup-prediction",
    status: "archived",
    accent: "worldcup",
  },
] as const;

export function isRegisteredWorkbenchPath(path: string) {
  if (path === "/") return true;
  return WORKBENCH_APPS.some(
    (app) => path === app.href || path.startsWith(`${app.href}/`),
  );
}
