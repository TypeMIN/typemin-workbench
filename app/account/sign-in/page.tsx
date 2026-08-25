import type { Metadata } from "next";

import { WorkbenchAuthForm } from "@/components/workbench-auth-form";
import { safeNextPath } from "@/lib/workbench/request";

export const metadata: Metadata = { title: "로그인" };

export default async function SignInPage({
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
        <h1>로그인</h1>
        <WorkbenchAuthForm mode="sign-in" next={next} />
      </div>
    </section>
  );
}
