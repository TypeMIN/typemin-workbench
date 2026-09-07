import { NextResponse } from "next/server";

import {
  partyErrorResponse,
  parsePartyTeam,
} from "@/lib/baseball-game/party/http";
import {
  partyCookieOptions,
  partyPlayerCookieName,
} from "@/lib/baseball-game/party/security";
import { joinPartyRoom } from "@/lib/baseball-game/party/service";
import {
  isValidRoomCode,
  normalizeRoomCode,
} from "@/lib/baseball-game/multiplayer/security";
import { readJson } from "@/lib/what-should-eat/api";
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
  const body = await readJson<Record<string, unknown>>(request);
  const nickname = typeof body?.nickname === "string" ? body.nickname : "";
  const team = parsePartyTeam(body?.team);
  const expectedRoomRevision = Number(body?.expectedRoomRevision);
  if (
    !team ||
    !Number.isSafeInteger(expectedRoomRevision) ||
    expectedRoomRevision < 0
  ) {
    return Response.json(
      { error: "참가 정보를 확인해 주세요." },
      { status: 400 },
    );
  }
  try {
    const result = await joinPartyRoom(roomCode, {
      nickname,
      team,
      expectedRoomRevision,
    });
    const response = NextResponse.json({
      snapshot: result.snapshot,
      playerUrl: `/baseball-game/party/${roomCode}/play`,
    });
    response.cookies.set(
      partyPlayerCookieName(roomCode),
      result.playerToken,
      partyCookieOptions(),
    );
    return response;
  } catch (error) {
    return partyErrorResponse(error);
  }
}
