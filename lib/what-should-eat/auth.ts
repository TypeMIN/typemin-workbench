import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AppUser, Gender } from "@/lib/what-should-eat/types";
import {
  clearWorkbenchSession,
  getCurrentAccount,
  isValidLoginId,
  isValidPin,
  normalizeLoginId,
} from "@/lib/workbench/auth";

type ProfileRow = {
  account_id: number;
  birth_year: number;
  gender: string;
};

export async function getCurrentUser(): Promise<AppUser | null> {
  const account = await getCurrentAccount();
  if (!account || account.mustChangePin) return null;
  const { data: profile, error } = await getSupabaseAdmin()
    .from("what_should_eat_profiles")
    .select("account_id, birth_year, gender")
    .eq("account_id", account.id)
    .maybeSingle<ProfileRow>();
  if (error || !profile) return null;
  return {
    id: account.id,
    loginId: account.loginId,
    displayName: account.displayName,
    birthYear: profile.birth_year,
    gender: profile.gender as Gender,
  };
}

export {
  clearWorkbenchSession as clearSession,
  isValidLoginId,
  isValidPin,
  normalizeLoginId,
};
export { hashPin, verifyPin } from "@/lib/workbench/security";
