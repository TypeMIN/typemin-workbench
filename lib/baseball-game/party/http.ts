import "server-only";

import { parseGameConfig } from "../multiplayer/http";
import type { TeamSide } from "../types";
import { PartyServiceError } from "./service";
import type { PartyHostCommand } from "./types";

export function parsePartyTeam(value: unknown): TeamSide | null {
  return value === "away" || value === "home" ? value : null;
}

export function parsePartyHostCommand(value: unknown): PartyHostCommand | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.type === "UPDATE_CONFIG") {
    const config = parseGameConfig(record.config);
    return config ? { type: "UPDATE_CONFIG", config } : null;
  }
  if (record.type === "MOVE_PLAYER") {
    const team = parsePartyTeam(record.team);
    return typeof record.playerId === "string" && team
      ? { type: "MOVE_PLAYER", playerId: record.playerId, team }
      : null;
  }
  if (record.type === "REMOVE_PLAYER") {
    return typeof record.playerId === "string"
      ? { type: "REMOVE_PLAYER", playerId: record.playerId }
      : null;
  }
  if (
    record.type === "START_GAME" ||
    record.type === "PAUSE_GAME" ||
    record.type === "RESUME_GAME" ||
    record.type === "SKIP_ACTIVE_PLAYER" ||
    record.type === "END_GAME"
  ) {
    return { type: record.type };
  }
  return null;
}

export function partyErrorResponse(error: unknown) {
  if (!(error instanceof PartyServiceError)) {
    return Response.json(
      { error: "파티플레이 요청을 처리하지 못했습니다." },
      { status: 500 },
    );
  }
  const status = {
    ROOM_NOT_FOUND: 404,
    ROOM_UNAVAILABLE: 409,
    HOST_REQUIRED: 401,
    PLAYER_REQUIRED: 401,
    TEAM_FULL: 409,
    NICKNAME_TAKEN: 409,
    NOT_ACTIVE_PLAYER: 403,
    INVALID_ACTION: 400,
    INVALID_COMMAND: 400,
    REVISION_CONFLICT: 409,
    STORAGE_ERROR: 500,
  }[error.code];
  return Response.json({ error: error.message, code: error.code }, { status });
}
