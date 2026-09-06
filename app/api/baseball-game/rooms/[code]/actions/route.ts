import { cookies } from "next/headers";

import {
  isUuid,
  multiplayerErrorResponse,
} from "@/lib/baseball-game/multiplayer/http";
import { parseMultiplayerCommand } from "@/lib/baseball-game/multiplayer/command";
import { submitMultiplayerCommand } from "@/lib/baseball-game/multiplayer/service";
import {
  isValidRoomCode,
  normalizeRoomCode,
  seatCookieName,
} from "@/lib/baseball-game/multiplayer/security";
import { readJson } from "@/lib/what-should-eat/api";
import { mutationOriginError } from "@/lib/workbench/request";

type ActionBody = {
  command?: unknown;
  expectedRevision?: unknown;
  idempotencyKey?: unknown;
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
  const body = await readJson<ActionBody>(request);
  const command = parseMultiplayerCommand(body?.command);
  const expectedRevision = Number(body?.expectedRevision);
  if (
    !command ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    !isUuid(body?.idempotencyKey)
  ) {
    return Response.json(
      { error: "올바르지 않은 경기 행동입니다." },
      { status: 400 },
    );
  }

  try {
    const token =
      (await cookies()).get(seatCookieName(roomCode))?.value ?? null;
    const snapshot = await submitMultiplayerCommand(roomCode, token, {
      command,
      expectedRevision,
      idempotencyKey: body.idempotencyKey,
    });
    return Response.json({ snapshot });
  } catch (error) {
    return multiplayerErrorResponse(error);
  }
}
