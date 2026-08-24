import type { Metadata } from "next";

import "./styles.css";

export const metadata: Metadata = {
  title: { absolute: "월드컵 예측 내기" },
  description: "5명이 함께 쓰는 월드컵 결과 예측 보드",
};

export default function WorldCupPredictionLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="worldcup-prediction-app">{children}</div>;
}
