import { multiplayerErrorResponse } from "@/lib/baseball-game/multiplayer/http";
import { getPartyRoomSnapshot } from "@/lib/baseball-game/multiplayer/service";
import {
  isValidRoomCode,
  normalizeRoomCode,
} from "@/lib/baseball-game/multiplayer/security";

export async function GET(
  _request: Request,
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
    const snapshot = await getPartyRoomSnapshot(roomCode);
    return Response.json(
      { snapshot },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return multiplayerErrorResponse(error);
  }
}
