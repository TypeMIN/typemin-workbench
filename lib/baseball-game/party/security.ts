import "server-only";

import { randomBytes } from "node:crypto";

import { hashSessionToken } from "@/lib/workbench/security";

import { normalizeRoomCode } from "../multiplayer/security";

export function newPartyToken() {
  return randomBytes(32).toString("base64url");
}

export function partyTokenHash(token: string) {
  return hashSessionToken(token);
}

export function partyHostCookieName(roomCode: string) {
  return `baseball_party_host_${normalizeRoomCode(roomCode).toLowerCase()}`;
}

export function partyPlayerCookieName(roomCode: string) {
  return `baseball_party_player_${normalizeRoomCode(roomCode).toLowerCase()}`;
}

export function partyCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
    priority: "high" as const,
  };
}
