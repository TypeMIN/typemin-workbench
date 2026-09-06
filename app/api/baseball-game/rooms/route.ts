import { NextResponse } from "next/server";

import {
  parseGameConfig,
  multiplayerErrorResponse,
} from "@/lib/baseball-game/multiplayer/http";
import { createMultiplayerRoom } from "@/lib/baseball-game/multiplayer/service";
import {
  seatCookieName,
  seatCookieOptions,
} from "@/lib/baseball-game/multiplayer/security";
import { readJson } from "@/lib/what-should-eat/api";
import { mutationOriginError } from "@/lib/workbench/request";

type CreateRoomBody = { config?: unknown };

export async function POST(request: Request) {
  const originError = mutationOriginError(request);
  if (originError) return originError;
  const body = await readJson<CreateRoomBody>(request);
  const config = parseGameConfig(body?.config);
  if (!config) {
    return Response.json(
      { error: "팀 이름과 경기 길이를 확인해 주세요." },
      { status: 400 },
    );
  }

  try {
    const { room, seatToken } = await createMultiplayerRoom(config);
    const response = NextResponse.json({
      roomCode: room.roomCode,
      seat: "away",
      roomUrl: `/baseball-game/rooms/${room.roomCode}`,
    });
    response.cookies.set(
      seatCookieName(room.roomCode),
      seatToken,
      seatCookieOptions(),
    );
    return response;
  } catch (error) {
    return multiplayerErrorResponse(error);
  }
}
