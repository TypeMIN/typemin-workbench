import { getCurrentUser } from "@/lib/what-should-eat/auth";
import { apiError } from "@/lib/what-should-eat/api";

export async function GET() {
  const user = await getCurrentUser();
  return user ? Response.json({ user }) : apiError("로그인이 필요합니다.", 401);
}
