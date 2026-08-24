import { clearSession } from "@/lib/what-should-eat/auth";

export async function POST() {
  await clearSession();
  return Response.json({ ok: true });
}
