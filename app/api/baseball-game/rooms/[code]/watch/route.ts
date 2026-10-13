import { multiplayerErrorResponse } from "@/lib/baseball-game/multiplayer/http";
import {
  isValidRoomCode,
  normalizeRoomCode,
} from "@/lib/baseball-game/multiplayer/security";
import { getMultiplayerSpectatorSnapshot } from "@/lib/baseball-game/multiplayer/service";
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
  if (!takeRateLimit("view", `watch:${requestIp(request)}`)) {
    return rateLimitedResponse();
  }
  try {
    return Response.json(
      { snapshot: await getMultiplayerSpectatorSnapshot(roomCode) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return multiplayerErrorResponse(error);
  }
}
