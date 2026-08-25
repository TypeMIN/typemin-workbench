"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import type { WorkbenchAccount } from "@/lib/workbench/types";

async function mutation(url: string, body: object) {
  const response = await fetch(url, {
    method: url.endsWith("profile") ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok)
    throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

export function WorkbenchAccountPage() {
  const [account, setAccount] = useState<WorkbenchAccount | null>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/workbench/auth/me").then(async (response) => {
      if (!response.ok) return setAccount(null);
      setAccount(
        ((await response.json()) as { account: WorkbenchAccount }).account,
      );
    });
  }, []);

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const data = (await mutation("/api/workbench/account/profile", {
        displayName: form.get("displayName"),
      })) as { account: WorkbenchAccount };
      setAccount(data.account);
      setMessage("표시 이름을 변경했습니다.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "변경하지 못했습니다.",
      );
    }
  }
  async function updatePin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      await mutation("/api/workbench/account/pin", {
        currentPin: form.get("currentPin"),
        newPin: form.get("newPin"),
      });
      setAccount((value) =>
        value ? { ...value, mustChangePin: false } : value,
      );
      setMessage("PIN을 변경하고 다른 세션을 종료했습니다.");
      event.currentTarget.reset();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "변경하지 못했습니다.",
      );
    }
  }

  if (account === undefined)
    return (
      <p className="workbench-account-state">계정 정보를 확인하고 있습니다…</p>
    );
  if (!account)
    return (
      <p className="workbench-account-state">
        로그인이 필요합니다.{" "}
        <Link href="/account/sign-in?next=%2Faccount">로그인</Link>
      </p>
    );
  return (
    <div className="workbench-account-columns">
      {account.mustChangePin && (
        <p className="workbench-account-warning">
          임시 PIN으로 로그인했습니다. 계속하려면 PIN을 변경하세요.
        </p>
      )}
      <form className="workbench-account-card" onSubmit={updateProfile}>
        <h2>프로필</h2>
        <p className="workbench-account-id">
          @{account.loginId} · {account.role}
        </p>
        <label>
          <span>표시 이름</span>
          <input
            defaultValue={account.displayName}
            maxLength={30}
            name="displayName"
            required
          />
        </label>
        <button type="submit">저장</button>
      </form>
      <form className="workbench-account-card" onSubmit={updatePin}>
        <h2>PIN 변경</h2>
        <label>
          <span>현재 PIN</span>
          <input
            inputMode="numeric"
            name="currentPin"
            pattern="[0-9]{4,6}"
            required
            type="password"
          />
        </label>
        <label>
          <span>새 PIN</span>
          <input
            inputMode="numeric"
            name="newPin"
            pattern="[0-9]{4,6}"
            required
            type="password"
          />
        </label>
        <button type="submit">PIN 변경</button>
      </form>
      {account.role === "owner" && (
        <Link className="workbench-admin-link" href="/account/admin">
          계정 관리자 열기 →
        </Link>
      )}
      {message && (
        <p className="workbench-form-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="workbench-form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
