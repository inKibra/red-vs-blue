import type {
  LabelCondition,
  MechanismFrame,
  OrderCondition,
  SalienceCondition,
} from "../../shared/types";
import {
  b64urlDecodeString,
  b64urlEncodeString,
  hmacSign,
  hmacVerify,
} from "./crypto";

/**
 * Compact, signed condition assignment carried by the client between
 * /assign and /submit. The DB enforces single-use via the unique `id`.
 */
export type ResponseTokenPayload = {
  /** Unique id for this assignment; doubles as response.id when submitted. */
  id: string;
  /** Issued-at, ms. */
  iat: number;
  /** Token version, for forward compatibility. */
  v: 1;
  frame: MechanismFrame;
  salience: SalienceCondition;
  label: LabelCondition;
  order: OrderCondition;
  /** Displayed labels are part of the signed payload so submit can map back. */
  dt: string;
  ds: string;
  /**
   * Optional referrer / campaign attribution captured at first assignment
   * from the page URL. Persisted in the signed payload so subsequent
   * answer/submit calls can land them on the row even after URL params
   * are cleaned up. All optional, all short string fields.
   */
  ref?: string;       // ?ref= ad-hoc id
  uts?: string;       // utm_source
  utm?: string;       // utm_medium
  utc?: string;       // utm_campaign
  utn?: string;       // utm_content
  utt?: string;       // utm_term
  rfu?: string;       // raw HTTP Referer URL on first hit
};

export async function signToken(
  secret: string,
  payload: ResponseTokenPayload,
): Promise<string> {
  const body = b64urlEncodeString(JSON.stringify(payload));
  const sig = await hmacSign(secret, body);
  return `${body}.${sig}`;
}

export async function verifyToken(
  secret: string,
  token: string,
): Promise<ResponseTokenPayload | null> {
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
  const p = parsed as Partial<ResponseTokenPayload>;
  if (
    typeof p.id !== "string" ||
    typeof p.iat !== "number" ||
    p.v !== 1 ||
    typeof p.frame !== "string" ||
    typeof p.salience !== "string" ||
    typeof p.label !== "string" ||
    typeof p.order !== "string" ||
    typeof p.dt !== "string" ||
    typeof p.ds !== "string"
  ) {
    return null;
  }
  return p as ResponseTokenPayload;
}
