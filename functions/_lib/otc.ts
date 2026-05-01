import { sha256Hex } from "./crypto";

export const OTC_LENGTH = 6;
export const OTC_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const OTC_MAX_ATTEMPTS = 5;

/** Generate a cryptographically random 6-digit numeric code. */
export function generateOtc(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0]! % 1_000_000).padStart(OTC_LENGTH, "0");
}

/** Hash an OTC for storage. The TOKEN_SECRET acts as the keying input. */
export async function hashOtc(secret: string, code: string): Promise<string> {
  return sha256Hex(`${code}:${secret}`);
}

export function otcExpiresAt(): string {
  return new Date(Date.now() + OTC_TTL_MS).toISOString();
}
