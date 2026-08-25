import type { Metadata } from "next";

import { WorkbenchAuthForm } from "@/components/workbench-auth-form";
import { safeNextPath } from "@/lib/workbench/request";

export const metadata: Metadata = { title: "가입" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next);
  return (
    <section className="workbench-auth-page">
      <div className="workbench-auth-brand" aria-label="Workbench">
        <span aria-hidden="true">W</span>
        <strong>Workbench</strong>
      </div>
      <div className="workbench-auth-panel">
        <h1>가입</h1>
        <WorkbenchAuthForm mode="sign-up" next={next} />
      </div>
    </section>
  );
}
