import { NextResponse } from "next/server";

import { multiplayerErrorResponse } from "@/lib/baseball-game/multiplayer/http";
import { getMultiplayerSnapshot } from "@/lib/baseball-game/multiplayer/service";
import {
  isValidRoomCode,
  normalizeRoomCode,
  seatCookieName,
  seatCookieOptions,
} from "@/lib/baseball-game/multiplayer/security";
import { readJson } from "@/lib/what-should-eat/api";
import { mutationOriginError } from "@/lib/workbench/request";

type SeatBody = { seatToken?: unknown };

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

  const body = await readJson<SeatBody>(request);
  const seatToken =
    typeof body?.seatToken === "string" ? body.seatToken.trim() : "";
  if (seatToken.length < 32 || seatToken.length > 128) {
    return Response.json(
      { error: "유효한 개인 화면 참가 링크가 아닙니다." },
      { status: 400 },
    );
  }

  try {
    const snapshot = await getMultiplayerSnapshot(roomCode, seatToken);
    const response = NextResponse.json({
      seat: snapshot.seat,
      roomUrl: `/baseball-game/rooms/${roomCode}`,
    });
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
