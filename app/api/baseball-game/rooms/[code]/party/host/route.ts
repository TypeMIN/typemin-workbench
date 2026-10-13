import { cookies } from "next/headers";

import {
  isValidRoomCode,
  normalizeRoomCode,
} from "@/lib/baseball-game/multiplayer/security";
import {
  parsePartyHostCommand,
  partyErrorResponse,
} from "@/lib/baseball-game/party/http";
import {
  partyHostCookieName,
  partyPlayerCookieName,
} from "@/lib/baseball-game/party/security";
import {
  submitPartyCoHostCommand,
  submitPartyHostCommand,
} from "@/lib/baseball-game/party/service";
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
  const command = parsePartyHostCommand(body?.command);
  const expectedRoomRevision = Number(body?.expectedRoomRevision);
  if (
    !command ||
    !Number.isSafeInteger(expectedRoomRevision) ||
    expectedRoomRevision < 0
  ) {
    return Response.json(
      { error: "올바르지 않은 방장 명령입니다." },
      { status: 400 },
    );
  }
  try {
    const jar = await cookies();
    const hostToken = jar.get(partyHostCookieName(roomCode))?.value ?? null;
    const input = { command, expectedRoomRevision };
    // The screen that opened the room is the host; a player's phone may
    // act as co-host when the host granted it.
    return Response.json({
      snapshot: hostToken
        ? await submitPartyHostCommand(roomCode, hostToken, input)
        : await submitPartyCoHostCommand(
            roomCode,
            jar.get(partyPlayerCookieName(roomCode))?.value ?? null,
            input,
          ),
    });
  } catch (error) {
    return partyErrorResponse(error);
  }
}
