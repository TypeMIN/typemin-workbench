import type { Metadata } from "next";

import "./styles.css";

export const metadata: Metadata = {
  title: { absolute: "야구 게임" },
  description:
    "세 종류의 12면체 주사위와 자동 야구 규칙 판정으로 진행하는 로컬 경기 엔진",
};

export default function BaseballGameLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="baseball-game-app">{children}</div>;
}
