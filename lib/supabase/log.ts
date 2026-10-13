import "server-only";

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

/**
 * Callers turn storage errors into user-safe codes, so the original
 * Supabase error is logged here before it is discarded.
 */
export function storageFailure(operation: string, error: unknown) {
  const detail = (error ?? {}) as SupabaseErrorLike;
  console.error(
    JSON.stringify({
      scope: "storage",
      operation,
      code: detail.code ?? null,
      message: detail.message ?? (error ? String(error) : null),
      details: detail.details ?? null,
      hint: detail.hint ?? null,
    }),
  );
  return new Error(operation);
}
