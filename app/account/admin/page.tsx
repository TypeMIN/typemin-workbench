import type { Metadata } from "next";

import { WorkbenchAdminPage } from "@/components/workbench-admin-page";

export const metadata: Metadata = { title: "계정 관리자" };

export default function AdminPage() {
  return (
    <section className="workbench-account-page">
      <p className="workbench-eyebrow">OWNER ONLY</p>
      <h1>계정 관리자</h1>
      <p>임시 PIN 발급 즉시 대상 계정의 모든 세션이 종료됩니다.</p>
      <WorkbenchAdminPage />
    </section>
  );
}
