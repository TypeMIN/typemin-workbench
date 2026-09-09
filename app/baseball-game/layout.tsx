import type { Metadata } from "next";

import "./styles.css";

export const metadata: Metadata = {
  title: { absolute: "야구 게임" },
  description:
    "투수와 타자의 한 번 선택 심리전과 전략카드로 즐기는 AI·멀티·파티플레이 야구 경기",
};

export default function BaseballGameLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="baseball-game-app">{children}</div>;
}
