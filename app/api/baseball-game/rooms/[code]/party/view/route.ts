import { cookies } from "next/headers";

import {
  isValidRoomCode,
  normalizeRoomCode,
} from "@/lib/baseball-game/multiplayer/security";
import { partyErrorResponse } from "@/lib/baseball-game/party/http";
import { partyPlayerCookieName } from "@/lib/baseball-game/party/security";
import { getPartyPlayerSnapshot } from "@/lib/baseball-game/party/service";
import {
  rateLimitedResponse,
  takeRateLimit,
} from "@/lib/baseball-game/rate-limit";
import { requestIp } from "@/lib/workbench/request";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const roomCode = normalizeRoomCode(code);
  if (!isValidRoomCode(roomCode))
    return Response.json(
      { error: "올바르지 않은 방 코드입니다." },
      { status: 400 },
    );
  try {
    const token =
      (await cookies()).get(partyPlayerCookieName(roomCode))?.value ?? null;
    if (!takeRateLimit("view", token ?? requestIp(request))) {
      return rateLimitedResponse();
    }
    return Response.json(
      { snapshot: await getPartyPlayerSnapshot(roomCode, token) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return partyErrorResponse(error);
  }
}
