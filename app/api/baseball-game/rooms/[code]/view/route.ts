import { cookies } from "next/headers";

import { multiplayerErrorResponse } from "@/lib/baseball-game/multiplayer/http";
import { getMultiplayerSnapshot } from "@/lib/baseball-game/multiplayer/service";
import {
  isValidRoomCode,
  normalizeRoomCode,
  seatCookieName,
} from "@/lib/baseball-game/multiplayer/security";
import {
  rateLimitedResponse,
  takeRateLimit,
} from "@/lib/baseball-game/rate-limit";
import { requestIp } from "@/lib/workbench/request";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await context.params;
  const roomCode = normalizeRoomCode(rawCode);
  if (!isValidRoomCode(roomCode)) {
    return Response.json(
      { error: "올바르지 않은 방 코드입니다." },
      { status: 400 },
    );
  }
  try {
    const token =
      (await cookies()).get(seatCookieName(roomCode))?.value ?? null;
    if (!takeRateLimit("view", token ?? requestIp(request))) {
      return rateLimitedResponse();
    }
    const snapshot = await getMultiplayerSnapshot(roomCode, token);
    return Response.json({ snapshot });
  } catch (error) {
    return multiplayerErrorResponse(error);
  }
}
