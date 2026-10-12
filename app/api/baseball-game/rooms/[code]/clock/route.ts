import { cookies } from "next/headers";

import { multiplayerErrorResponse } from "@/lib/baseball-game/multiplayer/http";
import {
  callMultiplayerTimeout,
  claimMultiplayerForfeit,
} from "@/lib/baseball-game/multiplayer/service";
import {
  isValidRoomCode,
  normalizeRoomCode,
  seatCookieName,
} from "@/lib/baseball-game/multiplayer/security";
import { readJson } from "@/lib/what-should-eat/api";
import { mutationOriginError } from "@/lib/workbench/request";

type ClockBody = {
  type?: unknown;
  expectedRevision?: unknown;
};

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
  const body = await readJson<ClockBody>(request);
  const expectedRevision = Number(body?.expectedRevision);
  const validTimeout =
    body?.type === "CALL_TIMEOUT" &&
    Number.isSafeInteger(expectedRevision) &&
    expectedRevision >= 0;
  if (!validTimeout && body?.type !== "CLAIM_FORFEIT") {
    return Response.json(
      { error: "올바르지 않은 경기 시계 요청입니다." },
      { status: 400 },
    );
  }

  try {
    const token =
      (await cookies()).get(seatCookieName(roomCode))?.value ?? null;
    const snapshot = validTimeout
      ? await callMultiplayerTimeout(roomCode, token, expectedRevision)
      : await claimMultiplayerForfeit(roomCode, token);
    return Response.json({ snapshot });
  } catch (error) {
    return multiplayerErrorResponse(error);
  }
}
