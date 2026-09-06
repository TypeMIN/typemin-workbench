import "server-only";

import { apiError } from "@/lib/what-should-eat/api";

import { SCHEDULED_INNINGS, type GameConfig } from "../types";
import { MultiplayerServiceError } from "./service";

export function parseGameConfig(value: unknown): GameConfig | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const innings = Number(record.innings);
  const awayTeamName =
    typeof record.awayTeamName === "string" ? record.awayTeamName.trim() : "";
  const homeTeamName =
    typeof record.homeTeamName === "string" ? record.homeTeamName.trim() : "";
  if (
    !SCHEDULED_INNINGS.includes(innings as GameConfig["innings"]) ||
    awayTeamName.length < 1 ||
    awayTeamName.length > 20 ||
    homeTeamName.length < 1 ||
    homeTeamName.length > 20
  ) {
    return null;
  }
  return {
    innings: innings as GameConfig["innings"],
    awayTeamName,
    homeTeamName,
  };
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function multiplayerErrorResponse(error: unknown) {
  if (!(error instanceof MultiplayerServiceError)) {
    return apiError("멀티플레이 요청을 처리하지 못했습니다.", 500);
  }
  const status = {
    ROOM_NOT_FOUND: 404,
    ROOM_UNAVAILABLE: 409,
    ROOM_FULL: 409,
    SEAT_REQUIRED: 401,
    NOT_YOUR_TURN: 403,
    INVALID_ACTION: 400,
    REVISION_CONFLICT: 409,
    STORAGE_ERROR: 500,
  }[error.code];
  return Response.json({ error: error.message, code: error.code }, { status });
}
