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
    <section className="workbench-account-page">
      <p className="workbench-eyebrow">ONE ACCOUNT</p>
      <h1>Workbench 계정 만들기</h1>
      <p>ID, 숫자 PIN, 표시 이름만으로 시작합니다.</p>
      <WorkbenchAuthForm mode="sign-up" next={next} />
    </section>
  );
}
