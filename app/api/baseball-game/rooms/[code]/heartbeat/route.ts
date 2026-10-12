import { cookies } from "next/headers";

import { multiplayerErrorResponse } from "@/lib/baseball-game/multiplayer/http";
import { parseSeatVisibility } from "@/lib/baseball-game/multiplayer/presence";
import { heartbeatMultiplayerSeat } from "@/lib/baseball-game/multiplayer/service";
import {
  isValidRoomCode,
  normalizeRoomCode,
  seatCookieName,
} from "@/lib/baseball-game/multiplayer/security";
import { readJson } from "@/lib/what-should-eat/api";
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
  const body = await readJson<{ visibility?: unknown }>(request);
  const visibility = parseSeatVisibility(body?.visibility);
  if (!visibility) {
    return Response.json(
      { error: "올바르지 않은 접속 상태입니다." },
      { status: 400 },
    );
  }

  try {
    const token =
      (await cookies()).get(seatCookieName(roomCode))?.value ?? null;
    const { seat } = await heartbeatMultiplayerSeat(
      roomCode,
      token,
      visibility,
    );
    return Response.json({ seat });
  } catch (error) {
    return multiplayerErrorResponse(error);
  }
}
