import { setCookie } from "./_lib/cookie";
import type { RouteContext } from "./_lib/env";
import { requireEnv } from "./_lib/env";
import { verifyPreviewLink } from "./_lib/preview-link";
import { signToken } from "./_lib/token";
import type {
  LabelCondition,
  MechanismFrame,
  OrderCondition,
  SalienceCondition,
} from "../shared/types";

const ASSIGNMENT_COOKIE = "rb_assignment";
const PREVIEW_COOKIE = "rb_preview";
const VOTED_COOKIE = "rb_voted";
const ASSIGNMENT_TTL_SECONDS = 7 * 24 * 60 * 60;
const PREVIEW_TTL_SECONDS = 30 * 24 * 60 * 60;
const VOTED_TTL_SECONDS = 180 * 24 * 60 * 60;

type Row = {
  token_id: string;
  email: string | null;
  email_verified_at: string | null;
  mechanism_frame: MechanismFrame;
  salience_condition: SalienceCondition;
  label_condition: LabelCondition;
  order_condition: OrderCondition;
  displayed_threshold_label: string;
  displayed_safe_label: string;
  submitted_at: string | null;
};

/**
 * GET /auth?key=<signed>
 *
 * Magic-link claim handler. The link in PreviewLinkEmail points here; we
 * verify the signature + expiry, mint a fresh canonical ResponseToken from
 * the row's stored condition fields, restore the same browser cookies a real
 * post-submit browser would have (`rb_assignment` + `rb_voted`), set
 * `rb_preview`, and redirect to /results.
 *
 * Failures redirect to /results with an error query param so the page can
 * surface a clear message. We never tell the user whether the failure was
 * "bad signature" vs "expired" vs "row gone" — those are all the same to
 * a returning user (the link no longer works) and exposing the distinction
 * would help an attacker probe.
 */
export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET" },
    });
  }
  requireEnv(ctx.env);

  const url = new URL(ctx.request.url);
  const key = url.searchParams.get("key") ?? "";
  const fail = (reason: string) => {
    const target = new URL("/results", url.origin);
    target.searchParams.set("auth", reason);
    return Response.redirect(target.toString(), 302);
  };

  if (!key) return fail("missing");

  const payload = await verifyPreviewLink(ctx.env.TOKEN_SECRET, key);
  if (!payload) return fail("expired"); // covers bad sig, malformed, expired

  const row = await ctx.env.DB.prepare(
    `SELECT token_id, email, email_verified_at, submitted_at,
            mechanism_frame, salience_condition, label_condition, order_condition,
            displayed_threshold_label, displayed_safe_label
       FROM responses WHERE token_id = ? AND submitted_at IS NOT NULL`
  )
    .bind(payload.id)
    .first<Row>();
  if (!row) return fail("expired");
  if (row.email !== payload.email) return fail("expired");

  // Mark email_verified_at on first successful claim (this IS verification —
  // they proved control of the email by clicking from their inbox).
  if (!row.email_verified_at) {
    await ctx.env.DB.prepare(
      `UPDATE responses SET email_verified_at = datetime('now') WHERE token_id = ? AND email = ?`,
    )
      .bind(row.token_id, payload.email)
      .run();
  }

  // Mint a fresh canonical ResponseToken. It is used for both rb_preview and
  // rb_assignment so a magic-link claim restores this browser to the same
  // already-responded state as the original submit browser.
  const responseToken = await signToken(ctx.env.TOKEN_SECRET, {
    id: row.token_id,
    iat: Date.now(),
    v: 1,
    frame: row.mechanism_frame,
    salience: row.salience_condition,
    label: row.label_condition,
    order: row.order_condition,
    dt: row.displayed_threshold_label,
    ds: row.displayed_safe_label,
  });

  const headers = new Headers({
    Location: "/results",
    "Cache-Control": "no-store",
  });
  headers.append(
    "Set-Cookie",
    setCookie(PREVIEW_COOKIE, responseToken, {
      requestUrl: ctx.request.url,
      httpOnly: true,
      sameSite: "Lax",
      maxAgeSeconds: PREVIEW_TTL_SECONDS,
    }),
  );
  headers.append(
    "Set-Cookie",
    setCookie(ASSIGNMENT_COOKIE, responseToken, {
      requestUrl: ctx.request.url,
      httpOnly: true,
      sameSite: "Lax",
      maxAgeSeconds: ASSIGNMENT_TTL_SECONDS,
    }),
  );
  headers.append(
    "Set-Cookie",
    setCookie(VOTED_COOKIE, "1", {
      requestUrl: ctx.request.url,
      httpOnly: false,
      sameSite: "Lax",
      maxAgeSeconds: VOTED_TTL_SECONDS,
    }),
  );

  // 302 to /results, with restored session cookies attached. The SPA will
  // fetch its data and render the personalised view; navigating back to /
  // now recovers the Done/share-link state through /api/poll/assign.
  return new Response(null, { status: 302, headers });
};
