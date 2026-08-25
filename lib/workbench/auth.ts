import "server-only";

import { cookies } from "next/headers";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  hashRateLimitKey,
  hashSessionToken,
  newSessionToken,
} from "@/lib/workbench/security";
import type { WorkbenchAccount } from "@/lib/workbench/types";

export const WORKBENCH_SESSION_COOKIE = "workbench_session";
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 30;

type AccountRow = {
  id: number;
  login_id: string;
  display_name: string;
  role: string;
  must_change_pin: boolean;
};

export function toWorkbenchAccount(row: AccountRow): WorkbenchAccount {
  return {
    id: Number(row.id),
    loginId: row.login_id,
    displayName: row.display_name,
    role: row.role === "owner" ? "owner" : "member",
    mustChangePin: row.must_change_pin,
  };
}

export function normalizeLoginId(value: string) {
  return value.trim().toLowerCase();
}

export function isValidLoginId(value: string) {
  return /^[a-z0-9]{3,20}$/.test(value);
}

export function isValidPin(value: string) {
  return /^\d{4,6}$/.test(value);
}

function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
    priority: "high" as const,
  };
}

export async function createWorkbenchSession(accountId: number) {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_AGE_SECONDS * 1000);
  const { error } = await getSupabaseAdmin()
    .from("workbench_sessions")
    .insert({
      account_id: accountId,
      token_hash: hashSessionToken(token),
      expires_at: expiresAt.toISOString(),
    });
  if (error) throw new Error("로그인 세션을 만들지 못했습니다.");

  (await cookies()).set(
    WORKBENCH_SESSION_COOKIE,
    token,
    sessionCookieOptions(SESSION_AGE_SECONDS),
  );
}

export async function getCurrentAccount(): Promise<WorkbenchAccount | null> {
  const token = (await cookies()).get(WORKBENCH_SESSION_COOKIE)?.value;
  if (!token) return null;

  const supabase = getSupabaseAdmin();
  const { data: session, error: sessionError } = await supabase
    .from("workbench_sessions")
    .select("account_id, expires_at")
    .eq("token_hash", hashSessionToken(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (sessionError || !session) return null;

  const { data: account, error: accountError } = await supabase
    .from("workbench_accounts")
    .select("id, login_id, display_name, role, must_change_pin")
    .eq("id", session.account_id)
    .is("disabled_at", null)
    .maybeSingle<AccountRow>();

  return accountError || !account ? null : toWorkbenchAccount(account);
}

export async function clearWorkbenchSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(WORKBENCH_SESSION_COOKIE)?.value;
  if (token) {
    await getSupabaseAdmin()
      .from("workbench_sessions")
      .delete()
      .eq("token_hash", hashSessionToken(token));
  }
  cookieStore.set(WORKBENCH_SESSION_COOKIE, "", sessionCookieOptions(0));
}

export async function clearAllWorkbenchSessions(accountId: number) {
  const { error } = await getSupabaseAdmin()
    .from("workbench_sessions")
    .delete()
    .eq("account_id", accountId);
  if (error) throw new Error("기존 세션을 폐기하지 못했습니다.");
}

export async function takeRateLimit(
  action: "sign_in" | "sign_up" | "check_id",
  ip: string,
  limit: number,
  windowSeconds: number,
) {
  const { data, error } = await getSupabaseAdmin().rpc(
    "workbench_take_rate_limit",
    {
      p_action: action,
      p_key_hash: hashRateLimitKey(`${action}:${ip}`),
      p_limit: limit,
      p_window_seconds: windowSeconds,
    },
  );
  if (error) throw new Error("요청 제한 상태를 확인하지 못했습니다.");
  return data === true;
}
