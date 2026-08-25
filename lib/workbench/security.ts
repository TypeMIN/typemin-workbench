import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export async function hashPin(pin: string) {
  const salt = randomBytes(16);
  const derived = (await scrypt(pin, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPin(pin: string, storedHash: string) {
  const [algorithm, saltValue, hashValue] = storedHash.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;

  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(hashValue, "base64url");
    const actual = (await scrypt(pin, salt, expected.length)) as Buffer;
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashRateLimitKey(value: string) {
  const pepper = process.env.WORKBENCH_AUTH_PEPPER;
  if (!pepper) {
    if (process.env.NODE_ENV === "test") {
      return createHmac("sha256", "workbench-test-pepper")
        .update(value)
        .digest("hex");
    }
    throw new Error("WORKBENCH_AUTH_PEPPER가 설정되지 않았습니다.");
  }
  return createHmac("sha256", pepper).update(value).digest("hex");
}

export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function newTemporaryPin() {
  return String(randomInt(100_000, 1_000_000));
}
