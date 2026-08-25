export const WORKBENCH_APPS = [
  {
    name: "오늘 뭐 먹지?",
    description: "함께 고르는 오늘의 한 끼와 장소 추천",
    href: "/what-should-eat",
    status: "사용 가능",
    accent: "meal",
  },
  {
    name: "월드컵 예측 내기",
    description: "완료된 5인 월드컵 예측 결과 아카이브",
    href: "/worldcup-prediction",
    status: "아카이브",
    accent: "worldcup",
  },
] as const;

export function isRegisteredWorkbenchPath(path: string) {
  if (path === "/") return true;
  return WORKBENCH_APPS.some(
    (app) => path === app.href || path.startsWith(`${app.href}/`),
  );
}
