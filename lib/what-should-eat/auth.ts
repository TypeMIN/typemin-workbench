import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { hashSessionToken } from "@/lib/what-should-eat/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AppUser, Gender } from "@/lib/what-should-eat/types";

const SESSION_COOKIE = "what_should_eat_session";
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 30;

type UserRow = {
  id: number;
  login_id: string;
  display_name: string;
  birth_year: number;
  gender: string;
};

export function toAppUser(row: UserRow): AppUser {
  return {
    id: Number(row.id),
    loginId: row.login_id,
    displayName: row.display_name,
    birthYear: row.birth_year,
    gender: row.gender as Gender,
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

export { hashPin, verifyPin } from "@/lib/what-should-eat/security";

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_AGE_SECONDS * 1000);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("what_should_eat_sessions").insert({
    user_id: userId,
    token_hash: hashSessionToken(token),
    expires_at: expiresAt.toISOString(),
  });

  if (error) throw new Error("로그인 세션을 만들지 못했습니다.");

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/what-should-eat",
    maxAge: SESSION_AGE_SECONDS,
    priority: "high",
  });
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const supabase = getSupabaseAdmin();
  const { data: session, error: sessionError } = await supabase
    .from("what_should_eat_sessions")
    .select("user_id, expires_at")
    .eq("token_hash", hashSessionToken(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (sessionError || !session) return null;

  const { data: user, error: userError } = await supabase
    .from("what_should_eat_users")
    .select("id, login_id, display_name, birth_year, gender")
    .eq("id", session.user_id)
    .maybeSingle<UserRow>();

  return userError || !user ? null : toAppUser(user);
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await getSupabaseAdmin()
      .from("what_should_eat_sessions")
      .delete()
      .eq("token_hash", hashSessionToken(token));
  }

  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/what-should-eat",
    maxAge: 0,
  });
}
