import { cookies } from "next/headers";

import { multiplayerErrorResponse } from "@/lib/baseball-game/multiplayer/http";
import { voteMultiplayerRematch } from "@/lib/baseball-game/multiplayer/service";
import {
  isValidRoomCode,
  normalizeRoomCode,
  seatCookieName,
} from "@/lib/baseball-game/multiplayer/security";
import { mutationOriginError } from "@/lib/workbench/request";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const originError = mutationOriginError(request);
  if (originError) return originError;
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
    const snapshot = await voteMultiplayerRematch(roomCode, token);
    return Response.json({ snapshot });
  } catch (error) {
    return multiplayerErrorResponse(error);
  }
}
