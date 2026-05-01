import {
  b64urlDecodeString,
  b64urlEncodeString,
  hmacSign,
  hmacVerify,
} from "./crypto";

/**
 * Short-lived signed token for the email-link re-auth flow.
 *
 * This is a *different* shape from the main rb_assignment / rb_preview
 * payload because we don't need any condition info to claim a preview link
 * — just the row id and an absolute expiry. After claiming, the handler
 * looks up the row and re-mints a full ResponseToken for the rb_preview
 * cookie.
 */
type LinkPayload = {
  /** token_id of the responses row this link is bound to. */
  id: string;
  /** Normalized recipient email this link was sent to. */
  email: string;
  /** Absolute expiry, seconds since epoch. */
  exp: number;
  /** Scope marker so a stolen link can't double as a different bearer token. */
  s: "preview-link";
};

/** One hour: tight enough to limit replay; long enough for inbox delays. */
export const PREVIEW_LINK_TTL_SECONDS = 60 * 60;

export async function signPreviewLink(
  secret: string,
  rowId: string,
  email: string,
): Promise<string> {
  const payload: LinkPayload = {
    id: rowId,
    email,
    exp: Math.floor(Date.now() / 1000) + PREVIEW_LINK_TTL_SECONDS,
    s: "preview-link",
  };
  const body = b64urlEncodeString(JSON.stringify(payload));
  const sig = await hmacSign(secret, body);
  return `${body}.${sig}`;
}

export async function verifyPreviewLink(
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
    p.s !== "preview-link"
  ) {
    return null;
  }
  // Expiry check: do this last so signature verification (constant time)
  // happens regardless of expiry, not branching on user-controlled data.
  if (p.exp < Math.floor(Date.now() / 1000)) return null;
  return p as LinkPayload;
}
