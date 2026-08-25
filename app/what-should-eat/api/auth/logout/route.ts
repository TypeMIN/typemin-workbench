import { clearSession } from "@/lib/what-should-eat/auth";
import { mutationOriginError } from "@/lib/workbench/request";

export async function POST(request: Request) {
  const originError = mutationOriginError(request);
  if (originError) return originError;
  await clearSession();
  return Response.json({ ok: true });
}
