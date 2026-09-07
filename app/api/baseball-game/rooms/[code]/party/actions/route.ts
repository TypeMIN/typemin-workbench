import { cookies } from "next/headers";

import { parseMultiplayerCommand } from "@/lib/baseball-game/multiplayer/command";
import { isUuid } from "@/lib/baseball-game/multiplayer/http";
import {
  isValidRoomCode,
  normalizeRoomCode,
} from "@/lib/baseball-game/multiplayer/security";
import { partyErrorResponse } from "@/lib/baseball-game/party/http";
import { partyPlayerCookieName } from "@/lib/baseball-game/party/security";
import { submitPartyAction } from "@/lib/baseball-game/party/service";
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
  const command = parseMultiplayerCommand(body?.command);
  const expectedRevision = Number(body?.expectedRevision);
  const expectedRoomRevision = Number(body?.expectedRoomRevision);
  if (
    !command ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    !Number.isSafeInteger(expectedRoomRevision) ||
    expectedRoomRevision < 0 ||
    !isUuid(body?.idempotencyKey)
  ) {
    return Response.json(
      { error: "올바르지 않은 경기 행동입니다." },
      { status: 400 },
    );
  }
  try {
    const token =
      (await cookies()).get(partyPlayerCookieName(roomCode))?.value ?? null;
    return Response.json({
      snapshot: await submitPartyAction(roomCode, token, {
        command,
        expectedRevision,
        expectedRoomRevision,
        idempotencyKey: body.idempotencyKey,
      }),
    });
  } catch (error) {
    return partyErrorResponse(error);
  }
}
