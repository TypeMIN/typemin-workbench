import { cookies } from "next/headers";

import { partyErrorResponse } from "@/lib/baseball-game/party/http";
import { partyHostCookieName } from "@/lib/baseball-game/party/security";
import { getPartyPublicSnapshot } from "@/lib/baseball-game/party/service";
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
    const hostToken =
      (await cookies()).get(partyHostCookieName(roomCode))?.value ?? null;
    const snapshot = await getPartyPublicSnapshot(roomCode, hostToken);
    return Response.json(
      { snapshot },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return partyErrorResponse(error);
  }
}
