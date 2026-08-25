"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { WorkbenchAccount } from "@/lib/workbench/types";

export function WorkbenchAccountControl({
  returnTo = "/",
}: {
  returnTo?: string;
}) {
  const [account, setAccount] = useState<WorkbenchAccount | null | undefined>();

  useEffect(() => {
    let active = true;
    fetch("/api/workbench/auth/me")
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { account: WorkbenchAccount }).account
          : null,
      )
      .then((nextAccount) => active && setAccount(nextAccount))
      .catch(() => active && setAccount(null));
    return () => {
      active = false;
    };
  }, []);

  async function signOut() {
    await fetch("/api/workbench/auth/sign-out", { method: "POST" });
    window.location.assign(returnTo);
  }

  if (account === undefined) {
    return (
      <span
        aria-label="계정 상태 확인 중"
        className="workbench-account-loading"
      />
    );
  }
  if (!account) {
    const next = encodeURIComponent(returnTo);
    return (
      <nav aria-label="Workbench 계정" className="workbench-account-control">
        <Link href={`/account/sign-in?next=${next}`}>로그인</Link>
        <Link href={`/account/sign-up?next=${next}`}>가입</Link>
      </nav>
    );
  }
  return (
    <nav aria-label="Workbench 계정" className="workbench-account-control">
      <Link href="/account">{account.displayName}</Link>
      {account.role === "owner" && <Link href="/account/admin">관리자</Link>}
      <button onClick={signOut} type="button">
        로그아웃
      </button>
    </nav>
  );
}
