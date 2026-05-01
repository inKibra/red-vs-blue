import {
  b64urlDecodeString,
  b64urlEncodeString,
  hmacSign,
  hmacVerify,
  timingSafeEqual,
} from "./crypto";
import { clearCookie, readCookie, setCookie } from "./cookie";

const COOKIE_NAME = "rb_admin";
/** 12 hours. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type SessionPayload = { sub: "admin"; exp: number };

export async function issueAdminCookie(
  request: Request,
  secret: string,
): Promise<string> {
  const payload: SessionPayload = { sub: "admin", exp: Date.now() + SESSION_TTL_MS };
  const body = b64urlEncodeString(JSON.stringify(payload));
  const sig = await hmacSign(secret, body);
  return setCookie(COOKIE_NAME, `${body}.${sig}`, {
    requestUrl: request.url,
    httpOnly: true,
    sameSite: "Strict",
    maxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearAdminCookie(request: Request): string {
  return clearCookie(COOKIE_NAME, { requestUrl: request.url, sameSite: "Strict" });
}

export async function isAdminAuthenticated(
  request: Request,
  secret: string,
): Promise<boolean> {
  const value = readCookie(request.headers.get("Cookie"), COOKIE_NAME);
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!(await hmacVerify(secret, body, sig))) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(b64urlDecodeString(body));
  } catch {
    return false;
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as SessionPayload).sub !== "admin" ||
    typeof (parsed as SessionPayload).exp !== "number"
  ) {
    return false;
  }
  return (parsed as SessionPayload).exp > Date.now();
}

/** Verify a plaintext password against the configured admin secret. */
export function checkAdminPassword(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  return timingSafeEqual(provided, expected);
}
