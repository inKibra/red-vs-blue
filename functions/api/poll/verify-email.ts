import type { VerifyEmailRequest } from "../../../shared/types";
import { setCookie } from "../../_lib/cookie";
import { timingSafeEqual } from "../../_lib/crypto";
import type { RouteContext } from "../../_lib/env";
import { requireEnv } from "../../_lib/env";
import { error, json, methodNotAllowed } from "../../_lib/http";
import { hashOtc, OTC_MAX_ATTEMPTS } from "../../_lib/otc";
import { verifyToken } from "../../_lib/token";

type Row = {
  email: string | null;
  otc_hash: string | null;
  otc_expires_at: string | null;
  otc_attempts: number;
  email_verified_at: string | null;
};

/**
 * POST /api/poll/verify-email  { responseToken, code }
 *
 * First-time email verification on the Done page. The user just submitted
 * the survey, gave us their email, and is typing the 6-digit OTC we sent.
 *
 * Re-auth on /results is a separate flow (POST /api/poll/preview-link →
 * GET /auth?key=...) — it doesn't go through this endpoint.
 *
 * On success: marks email_verified_at and sets the rb_preview cookie to
 * the same signed responseToken so the holder can read /results live.
 */
export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);
  requireEnv(ctx.env);

  let body: Partial<VerifyEmailRequest>;
  try {
    body = (await ctx.request.json()) as Partial<VerifyEmailRequest>;
  } catch {
    return error(400, "Invalid JSON body.");
  }

  const token = body.responseToken;
  if (typeof token !== "string") return error(400, "Missing responseToken.");
  const payload = await verifyToken(ctx.env.TOKEN_SECRET, token);
  if (!payload) return error(400, "Invalid responseToken.");

  const code = body.code;
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return error(400, "Code must be 6 digits.");
  }

  const row = await ctx.env.DB.prepare(
    `SELECT email, otc_hash, otc_expires_at, otc_attempts, email_verified_at
     FROM responses WHERE token_id = ?`,
  )
    .bind(payload.id)
    .first<Row>();
  if (!row) return error(404, "No response found.");
  if (!row.email) return error(400, "No email on file.");
  if (row.email_verified_at) return json({ ok: true, alreadyVerified: true });
  if (row.otc_attempts >= OTC_MAX_ATTEMPTS) {
    return error(429, "Too many attempts. Try again later.");
  }
  if (!row.otc_hash || !row.otc_expires_at) {
    return error(400, "No verification code on file.");
  }
  const expires = new Date(row.otc_expires_at);
  if (isNaN(expires.valueOf()) || expires < new Date()) {
    return error(410, "Code expired.");
  }

  const expected = await hashOtc(ctx.env.TOKEN_SECRET, code);
  if (!timingSafeEqual(expected, row.otc_hash)) {
    await ctx.env.DB.prepare(
      `UPDATE responses SET otc_attempts = otc_attempts + 1 WHERE token_id = ?`,
    )
      .bind(payload.id)
      .run();
    return error(400, "Incorrect code.");
  }

  await ctx.env.DB.prepare(
    `UPDATE responses
       SET email_verified_at = datetime('now'),
           otc_hash = NULL,
           otc_expires_at = NULL
     WHERE token_id = ?`,
  )
    .bind(payload.id)
    .run();

  return json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": setCookie("rb_preview", token, {
          requestUrl: ctx.request.url,
          httpOnly: true,
          sameSite: "Lax",
          maxAgeSeconds: 30 * 24 * 60 * 60,
        }),
      },
    },
  );
};
