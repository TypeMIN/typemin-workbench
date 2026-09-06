import "server-only";

import { randomBytes } from "node:crypto";

import { hashSessionToken } from "@/lib/workbench/security";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase();
}

export function isValidRoomCode(value: string) {
  return /^[A-Z2-9]{6}$/.test(normalizeRoomCode(value));
}

export function newRoomCode(random: () => number = Math.random) {
  return Array.from({ length: 6 }, () => {
    const index = Math.min(
      ROOM_CODE_ALPHABET.length - 1,
      Math.floor(random() * ROOM_CODE_ALPHABET.length),
    );
    return ROOM_CODE_ALPHABET[index];
  }).join("");
}

export function newSeatToken() {
  return randomBytes(32).toString("base64url");
}

export function seatTokenHash(token: string) {
  return hashSessionToken(token);
}

export function seatCookieName(roomCode: string) {
  return `baseball_room_${normalizeRoomCode(roomCode).toLowerCase()}`;
}

export function seatCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
    priority: "high" as const,
  };
}
