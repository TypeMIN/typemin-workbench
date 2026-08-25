import { apiError } from "@/lib/what-should-eat/api";
import { isRegisteredWorkbenchPath } from "@/lib/workbench/apps";

export function mutationOriginError(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin && process.env.NODE_ENV !== "production") return null;
  if (!origin || origin !== new URL(request.url).origin) {
    return apiError("허용되지 않은 요청 출처입니다.", 403);
  }
  return null;
}

export function requestIp(request: Request) {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export function safeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const parsed = new URL(value, "https://workbench.invalid");
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return parsed.origin === "https://workbench.invalid" &&
      isRegisteredWorkbenchPath(parsed.pathname)
      ? path
      : "/";
  } catch {
    return "/";
  }
}
