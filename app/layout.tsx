import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Workbench",
    template: "%s | Workbench",
  },
  description: "여러 토이 웹앱을 빠르게 만들고 직접 사용하는 개인 개발 공간",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
