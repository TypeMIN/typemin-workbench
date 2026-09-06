import { NextResponse } from "next/server";

import { multiplayerErrorResponse } from "@/lib/baseball-game/multiplayer/http";
import {
  getMultiplayerSnapshot,
  joinMultiplayerRoom,
} from "@/lib/baseball-game/multiplayer/service";
import {
  isValidRoomCode,
  normalizeRoomCode,
  seatCookieName,
  seatCookieOptions,
} from "@/lib/baseball-game/multiplayer/security";
import { mutationOriginError } from "@/lib/workbench/request";
import { cookies } from "next/headers";

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
    const cookieStore = await cookies();
    const existingToken =
      cookieStore.get(seatCookieName(roomCode))?.value ?? null;
    if (existingToken) {
      const snapshot = await getMultiplayerSnapshot(roomCode, existingToken);
      return NextResponse.json({ snapshot });
    }

    const { seatToken } = await joinMultiplayerRoom(roomCode);
    const snapshot = await getMultiplayerSnapshot(roomCode, seatToken);
    const response = NextResponse.json({ snapshot });
    response.cookies.set(
      seatCookieName(roomCode),
      seatToken,
      seatCookieOptions(),
    );
    return response;
  } catch (error) {
    return multiplayerErrorResponse(error);
  }
}
