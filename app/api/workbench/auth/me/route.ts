import { getCurrentAccount } from "@/lib/workbench/auth";

export async function GET() {
  const account = await getCurrentAccount();
  return account
    ? Response.json({ account })
    : Response.json({ account: null }, { status: 401 });
}
