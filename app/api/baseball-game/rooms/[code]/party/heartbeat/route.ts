import { cookies } from "next/headers";

import {
  isValidRoomCode,
  normalizeRoomCode,
} from "@/lib/baseball-game/multiplayer/security";
import { partyErrorResponse } from "@/lib/baseball-game/party/http";
import { partyPlayerCookieName } from "@/lib/baseball-game/party/security";
import { heartbeatPartyPlayer } from "@/lib/baseball-game/party/service";
import { mutationOriginError } from "@/lib/workbench/request";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const originError = mutationOriginError(request);
  if (originError) return originError;
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
    await heartbeatPartyPlayer(roomCode, token);
    return Response.json({ ok: true });
  } catch (error) {
    return partyErrorResponse(error);
  }
}
