import type { Metadata } from "next";

import "./styles.css";

export const metadata: Metadata = {
  title: { absolute: "야구 게임" },
  description:
    "세 종류의 12면체 주사위와 공격·수비 전략카드로 진행하는 로컬 야구 경기",
};

export default function BaseballGameLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="baseball-game-app">{children}</div>;
}
