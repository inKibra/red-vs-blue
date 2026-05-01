import {
  b64urlDecodeString,
  b64urlEncodeString,
  hmacSign,
  hmacVerify,
} from "./crypto";

/**
 * Long-lived signed token for the unsubscribe flow.
 *
 * Different shape from `preview-link` because:
 *   - TTL is intentionally long (a one-year-old email still gets a working
 *     unsubscribe button — that's what recipients expect).
 *   - Scope marker (`s`) prevents an unsubscribe link from being replayed as
 *     any other bearer token.
 *   - Email is bound into the payload so a row whose email later changed
 *     can't be unsubscribed by clicking an old link addressed to the prior
 *     address.
 *
 * Both `signUnsubscribeLink` and `verifyUnsubscribeLink` operate on the
 * same `body.signature` string. The body is base64url(JSON(payload)) and
 * the signature is HMAC-SHA-256 over that body string.
 */
type LinkPayload = {
  /** token_id of the responses row this link is bound to. */
  id: string;
  /** Normalized recipient email this link was sent to. */
  email: string;
  /** Absolute expiry, seconds since epoch. */
  exp: number;
  /** Scope marker; mismatch means caller fed us the wrong kind of token. */
  s: "unsubscribe";
};

/** One year. Long enough that the link still works on stale forwards. */
export const UNSUBSCRIBE_LINK_TTL_SECONDS = 365 * 24 * 60 * 60;

export async function signUnsubscribeLink(
  secret: string,
  rowId: string,
  email: string,
): Promise<string> {
  const payload: LinkPayload = {
    id: rowId,
    email,
    exp: Math.floor(Date.now() / 1000) + UNSUBSCRIBE_LINK_TTL_SECONDS,
    s: "unsubscribe",
  };
  const body = b64urlEncodeString(JSON.stringify(payload));
  const sig = await hmacSign(secret, body);
  return `${body}.${sig}`;
}

export async function verifyUnsubscribeLink(
  secret: string,
  token: string,
): Promise<LinkPayload | null> {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const ok = await hmacVerify(secret, body, sig);
  if (!ok) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(b64urlDecodeString(body));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Partial<LinkPayload>;
  if (
    typeof p.id !== "string" ||
    typeof p.email !== "string" ||
    typeof p.exp !== "number" ||
    p.s !== "unsubscribe"
  ) {
    return null;
  }
  if (p.exp < Math.floor(Date.now() / 1000)) return null;
  return p as LinkPayload;
}
