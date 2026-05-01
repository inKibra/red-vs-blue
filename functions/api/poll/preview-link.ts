import { sendEmail } from "../../_lib/email";
import type { RouteContext } from "../../_lib/env";
import { requireEnv } from "../../_lib/env";
import { error, json, methodNotAllowed } from "../../_lib/http";
import { signPreviewLink } from "../../_lib/preview-link";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/poll/preview-link  { email }
 *
 * Email-link re-auth path. Used by /results when a returning visitor enters
 * an email they previously gave us. We send them a one-click link instead
 * of a 6-digit OTC: clicking the link in the email sets their preview
 * cookie and lands them straight on /results, no typing.
 *
 * Match criterion: any submitted row whose `email` matches. We don't gate
 * on email_verified_at — clicking the link itself proves possession of the
 * email address, which is the same property the OTC was protecting.
 *
 * Always returns `{ ok: true }` regardless of whether the email matched a
 * known row. Prevents email-enumeration: an attacker cannot probe addresses
 * by watching response shape or timing.
 */
export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);
  requireEnv(ctx.env);

  let body: { email?: unknown };
  try {
    body = (await ctx.request.json()) as { email?: unknown };
  } catch {
    return error(400, "Invalid JSON body.");
  }

  if (typeof body.email !== "string") return error(400, "Missing email.");
  const email = body.email.trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !EMAIL_RE.test(email)) {
    return error(400, "Invalid email address.");
  }

  // Most-recent submitted row that bound this email. Picking by submitted_at
  // DESC handles the (rare) case where the same email got attached to more
  // than one row — we always link the latest.
  const row = await ctx.env.DB.prepare(
    `SELECT token_id
       FROM responses
      WHERE email = ?
        AND submitted_at IS NOT NULL
      ORDER BY submitted_at DESC
      LIMIT 1`,
  )
    .bind(email)
    .first<{ token_id: string }>();

  // Do equivalent local crypto work for known and unknown addresses; only the
  // known branch schedules delivery. The email send itself is deferred below.
  const link = await signPreviewLink(
    ctx.env.TOKEN_SECRET,
    row?.token_id ?? "00000000-0000-0000-0000-000000000000",
    email,
  );

  if (row) {
    const url = new URL(ctx.request.url);
    const claimUrl = `${url.origin}/auth?key=${encodeURIComponent(link)}`;

    ctx.waitUntil(
      sendEmail(ctx.env, {
        to: email,
        subject: "Your Threshold Study results preview",
        template: {
          kind: "preview-link",
          props: { link: claimUrl, domain: url.host },
        },
      }).catch((e) => {
        console.error("Preview-link email send failed:", (e as Error).message);
        // Silent: we don't expose send errors to clients (would leak email
        // existence via differential timing/error responses).
      }),
    );
  }

  return json({ ok: true });
};
