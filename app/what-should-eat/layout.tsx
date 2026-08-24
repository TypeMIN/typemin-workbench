import type { Metadata } from "next";

import "./styles.css";

export const metadata: Metadata = {
  title: { absolute: "오늘 뭐 먹지?" },
  description: "함께 고르는 오늘의 한 끼",
};

export default function WhatShouldEatLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="what-should-eat-app">{children}</div>;
}
