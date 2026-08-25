import { apiError } from "@/lib/what-should-eat/api";

export async function POST() {
  return apiError("Workbench 공통 가입 경로를 이용해 주세요.", 410);
}
