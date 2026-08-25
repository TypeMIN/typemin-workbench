import type { Metadata } from "next";

import { WorkbenchAccountPage } from "@/components/workbench-account-page";

export const metadata: Metadata = { title: "계정 관리" };

export default function AccountPage() {
  return (
    <section className="workbench-account-page">
      <p className="workbench-eyebrow">ACCOUNT</p>
      <h1>계정 관리</h1>
      <WorkbenchAccountPage />
    </section>
  );
}
