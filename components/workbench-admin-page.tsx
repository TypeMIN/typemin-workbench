"use client";

import { useCallback, useEffect, useState } from "react";

import type { WorkbenchAdminAccount } from "@/lib/workbench/types";

export function WorkbenchAdminPage() {
  const [accounts, setAccounts] = useState<WorkbenchAdminAccount[]>();
  const [error, setError] = useState("");
  const [temporaryPin, setTemporaryPin] = useState<{
    id: number;
    pin: string;
  }>();
  const load = useCallback(async () => {
    const response = await fetch("/api/workbench/admin/accounts");
    const data = (await response.json().catch(() => ({}))) as {
      accounts?: WorkbenchAdminAccount[];
      error?: string;
    };
    if (!response.ok)
      throw new Error(data.error || "계정 목록을 불러오지 못했습니다.");
    setAccounts(data.accounts ?? []);
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/workbench/admin/accounts")
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          accounts?: WorkbenchAdminAccount[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(data.error || "계정 목록을 불러오지 못했습니다.");
        if (active) setAccounts(data.accounts ?? []);
      })
      .catch((caught) => {
        if (active)
          setError(
            caught instanceof Error ? caught.message : "불러오지 못했습니다.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  async function resetPin(id: number) {
    if (
      !window.confirm(
        "이 계정의 기존 세션을 모두 종료하고 임시 PIN을 발급할까요?",
      )
    )
      return;
    const response = await fetch(
      `/api/workbench/admin/accounts/${id}/reset-pin`,
      { method: "POST" },
    );
    const data = (await response.json().catch(() => ({}))) as {
      temporaryPin?: string;
      error?: string;
    };
    if (!response.ok || !data.temporaryPin)
      return setError(data.error || "임시 PIN을 발급하지 못했습니다.");
    setTemporaryPin({ id, pin: data.temporaryPin });
    await load();
  }

  if (error)
    return (
      <p className="workbench-form-error" role="alert">
        {error}
      </p>
    );
  if (!accounts)
    return (
      <p className="workbench-account-state">계정 목록을 불러오고 있습니다…</p>
    );
  return (
    <div className="workbench-admin-list">
      {temporaryPin && (
        <p className="workbench-account-warning" role="status">
          계정 #{temporaryPin.id}의 임시 PIN:{" "}
          <strong>{temporaryPin.pin}</strong> — 이 화면을 벗어나면 다시 볼 수
          없습니다.
        </p>
      )}
      {accounts.map((account) => (
        <article className="workbench-admin-account" key={account.id}>
          <div>
            <strong>{account.displayName}</strong>
            <span>
              @{account.loginId} · {account.role}
            </span>
          </div>
          <button onClick={() => resetPin(account.id)} type="button">
            임시 PIN 발급
          </button>
        </article>
      ))}
    </div>
  );
}
