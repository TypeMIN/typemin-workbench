"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

export function WorkbenchAuthForm({
  mode,
  next,
}: {
  mode: "sign-in" | "sign-up";
  next: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signingUp = mode === "sign-up";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const body = {
      loginId: form.get("loginId"),
      pin: form.get("pin"),
      ...(signingUp ? { displayName: form.get("displayName") } : {}),
    };
    try {
      const response = await fetch(`/api/workbench/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        account?: { mustChangePin?: boolean };
      };
      if (!response.ok)
        throw new Error(data.error || "요청을 처리하지 못했습니다.");
      window.location.assign(data.account?.mustChangePin ? "/account" : next);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "인증에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  const alternate = signingUp ? "sign-in" : "sign-up";
  return (
    <form className="workbench-auth-form" onSubmit={submit}>
      <label>
        <span>ID</span>
        <input
          autoComplete="username"
          maxLength={20}
          minLength={3}
          name="loginId"
          pattern="[a-z0-9]{3,20}"
          placeholder="ID"
          required
        />
      </label>
      <label>
        <span>PIN</span>
        <input
          autoComplete={signingUp ? "new-password" : "current-password"}
          inputMode="numeric"
          maxLength={6}
          minLength={4}
          name="pin"
          pattern="[0-9]{4,6}"
          placeholder="숫자 4~6자리"
          required
          type="password"
        />
      </label>
      {signingUp && (
        <label>
          <span>이름</span>
          <input
            autoComplete="name"
            maxLength={30}
            name="displayName"
            placeholder="이름"
            required
          />
        </label>
      )}
      {error && (
        <p className="workbench-form-error" role="alert">
          {error}
        </p>
      )}
      <button disabled={busy} type="submit">
        {busy ? "처리 중…" : signingUp ? "가입하기" : "로그인"}
      </button>
      <p className="workbench-auth-alternate">
        {signingUp ? "이미 계정이 있나요?" : "계정이 없나요?"}{" "}
        <Link href={`/account/${alternate}?next=${encodeURIComponent(next)}`}>
          {signingUp ? "로그인" : "가입"}
        </Link>
      </p>
    </form>
  );
}
