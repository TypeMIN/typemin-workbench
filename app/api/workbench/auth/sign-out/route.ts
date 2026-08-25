import { clearWorkbenchSession } from "@/lib/workbench/auth";
import { mutationOriginError } from "@/lib/workbench/request";

export async function POST(request: Request) {
  const originError = mutationOriginError(request);
  if (originError) return originError;
  await clearWorkbenchSession();
  return new Response(null, { status: 204 });
}
