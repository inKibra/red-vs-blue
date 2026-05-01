import type { SubscribeRequest, SubscribeResponse } from "../../../shared/types";
import { sendEmail } from "../../_lib/email";
import type { RouteContext } from "../../_lib/env";
import { requireEnv } from "../../_lib/env";
import { error, json, methodNotAllowed } from "../../_lib/http";
import { generateOtc, hashOtc, otcExpiresAt } from "../../_lib/otc";
import { verifyToken } from "../../_lib/token";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Bind an email to a previously-submitted response and issue a one-time code.
 * Verifying that code (POST /api/poll/verify-email) unlocks two things:
 *   - early access to the live aggregate at /results (sneak peek)
 *   - the published-results notification email
 *
 * The OTC also doubles as a stronger duplicate-vote signal in the data,
 * since verified emails are harder to share than cookies/IPs.
 */
export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);
  requireEnv(ctx.env);

  let body: Partial<SubscribeRequest>;
  try {
    body = (await ctx.request.json()) as Partial<SubscribeRequest>;
  } catch {
    return error(400, "Invalid JSON body.");
  }

  const token = body.responseToken;
  if (typeof token !== "string") return error(400, "Missing responseToken.");
  const payload = await verifyToken(ctx.env.TOKEN_SECRET, token);
  if (!payload) return error(400, "Invalid responseToken.");

  if (typeof body.email !== "string") return error(400, "Missing email.");
  const email = body.email.trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !EMAIL_RE.test(email)) {
    return error(400, "Invalid email address.");
  }

  // Row must exist and be submitted.
  const row = await ctx.env.DB.prepare(
    `SELECT submitted_at, email_verified_at FROM responses WHERE token_id = ?`,
  )
    .bind(payload.id)
    .first<{ submitted_at: string | null; email_verified_at: string | null }>();
  if (!row) return error(404, "No response on file.");
  if (!row.submitted_at) return error(409, "Submit your response first.");
  if (row.email_verified_at) {
    return error(409, "An email is already verified for this response.");
  }

  const code = generateOtc();
  const otcHash = await hashOtc(ctx.env.TOKEN_SECRET, code);
  const expires = otcExpiresAt();

  await ctx.env.DB.prepare(
    `UPDATE responses
     SET email = ?,
         otc_hash = ?,
         otc_expires_at = ?,
         otc_attempts = 0,
         updated_at = datetime('now')
     WHERE token_id = ?`,
  )
    .bind(email, otcHash, expires, payload.id)
    .run();

  // Bare-host derivation: the request URL gives us the canonical host the
  // user is looking at. Apple's Domain-Bound Codes parser matches the
  // `@host` line in the email against the page's host on autofill.
  const requestHost = new URL(ctx.request.url).host;
  try {
    await sendEmail(ctx.env, {
      to: email,
      // Subject signals OTP context to mail clients without exposing the code
      // in lockscreen previews. Apple's autofill parser uses body, not subject.
      subject: "Your Threshold Study verification code",
      template: { kind: "otc", props: { code, domain: requestHost } },
    });
  } catch (e) {
    console.error("OTC email send failed:", (e as Error).message);
    // Do not surface to client: the OTC is in the DB; resend can recover.
  }

  const responseBody: SubscribeResponse = {
    ok: true,
    awaitingVerification: true,
  };
  return json(responseBody);
};
