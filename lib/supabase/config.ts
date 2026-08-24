const requiredEnvironmentVariables = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

export type SupabaseConfig = Readonly<{
  url: string;
  publishableKey: string;
}>;

type SupabaseEnvironment = Readonly<Record<string, string | undefined>>;

export function isSupabaseConfigured(
  environment: SupabaseEnvironment = process.env,
): boolean {
  return requiredEnvironmentVariables.every((name) =>
    Boolean(environment[name]?.trim()),
  );
}

export function getSupabaseConfig(
  environment: SupabaseEnvironment = process.env,
): SupabaseConfig {
  const missing = requiredEnvironmentVariables.filter(
    (name) => !environment[name]?.trim(),
  );

  if (missing.length > 0) {
    throw new Error(
      `Supabase를 사용하려면 다음 환경변수를 설정하세요: ${missing.join(", ")}`,
    );
  }

  return {
    url: environment.NEXT_PUBLIC_SUPABASE_URL as string,
    publishableKey: environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
  };
}
