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
    <section className="workbench-account-page">
      <p className="workbench-eyebrow">SHARED ACCOUNT</p>
      <h1>Workbench 로그인</h1>
      <p>모든 Workbench 앱에서 같은 ID와 PIN을 사용합니다.</p>
      <WorkbenchAuthForm mode="sign-in" next={next} />
    </section>
  );
}
