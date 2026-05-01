import { buildPrompt, randomizeCondition } from "../../../shared/conditions";
import type { AssignResponse, AssignedCondition } from "../../../shared/types";
import { readCookie, setCookie } from "../../_lib/cookie";
import type { RouteContext } from "../../_lib/env";
import { requireEnv } from "../../_lib/env";
import { error, json, methodNotAllowed } from "../../_lib/http";
import { getPollStatus } from "../../_lib/poll";
import { signToken, verifyToken } from "../../_lib/token";

const VOTED_COOKIE = "rb_voted";
const ASSIGNMENT_COOKIE = "rb_assignment";
const PREVIEW_COOKIE = "rb_preview";
/** Sticky for a week — long enough to survive Twitter-tab churn. */
const ASSIGNMENT_TTL_SECONDS = 7 * 24 * 60 * 60;
const VOTED_TTL_SECONDS = 180 * 24 * 60 * 60;

export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);
  requireEnv(ctx.env);


  const cookieHeader = ctx.request.headers.get("Cookie");
  if (readCookie(cookieHeader, VOTED_COOKIE) === "1") {
    // Refresh-after-submit path: try to recover the share_code so the Done
    // page can re-render its cohort panel. We only have it if the original
    // assignment cookie is also still around. Returning alreadyVoted with
    // no shareCode is still valid; the client falls back to abbreviated.
    let shareCode: string | null = null;
    let responseToken: string | undefined;
    let verified = false;
    let email: string | null = null;
    const existing = readCookie(cookieHeader, ASSIGNMENT_COOKIE);
    if (existing) {
      const payload = await verifyToken(ctx.env.TOKEN_SECRET, existing);
      if (payload) {
        responseToken = existing;
        const row = await ctx.env.DB.prepare(
          `SELECT share_code, email, email_verified_at
             FROM responses WHERE token_id = ?`,
        )
          .bind(payload.id)
          .first<{
            share_code: string | null;
            email: string | null;
            email_verified_at: string | null;
          }>();
        shareCode = row?.share_code ?? null;
        email = row?.email ?? null;
        verified = Boolean(row?.email && row.email_verified_at);
      }
    }
    const body: AssignResponse = {
      alreadyVoted: true,
      verified,
      email,
      ...(shareCode ? { shareCode } : {}),
      ...(responseToken ? { responseToken } : {}),
    };
    return json(body);
  }

  // If they already have a sticky assignment, return the same condition so
  // refreshing the page does not re-randomize the experimental cell.
  // (cookieHeader already declared above)
  const existing = readCookie(cookieHeader, ASSIGNMENT_COOKIE);
  if (existing) {
    const payload = await verifyToken(ctx.env.TOKEN_SECRET, existing);
    if (payload) {
      // Check the DB for an existing row keyed to this token. Three cases:
      //   - row exists, submitted_at is set      → alreadyVoted (no resume)
      //   - row exists, submitted_at is null     → return condition + partial
      //   - no row                                → return condition only (fresh)
      // The submitted_at check is what fixes the "refresh = Done" bug: a
      // partial response (created by the per-click INSERT OR IGNORE) used
      // to be misclassified as already-voted.
      const row = await ctx.env.DB.prepare(
        `SELECT submitted_at,
                email,
                email_verified_at,
                personal_choice,
                public_recommendation,
                dependent_recommendation,
                expected_majority,
                confidence,
                reason_text,
                share_code
         FROM responses WHERE token_id = ? LIMIT 1`,
      )
        .bind(payload.id)
        .first<{
          submitted_at: string | null;
          email: string | null;
          email_verified_at: string | null;
          personal_choice: "threshold" | "safe" | null;
          public_recommendation: "threshold" | "safe" | null;
          dependent_recommendation: "threshold" | "safe" | null;
          expected_majority: "threshold" | "safe" | null;
          confidence: number | null;
          reason_text: string | null;
          share_code: string | null;
        }>();
      if (row?.submitted_at) {
        const body: AssignResponse = {
          alreadyVoted: true,
          verified: Boolean(row.email && row.email_verified_at),
          email: row.email ?? null,
          responseToken: existing,
          ...(row.share_code ? { shareCode: row.share_code } : {}),
        };
        return json(body);
      }

      const { promptText, promptIsHtml } = buildPrompt(
        payload.frame,
        payload.salience,
        payload.order,
        payload.dt,
        payload.ds,
      );
      const condition: AssignedCondition = {
        mechanismFrame: payload.frame,
        salienceCondition: payload.salience,
        labelCondition: payload.label,
        orderCondition: payload.order,
        displayedThresholdLabel: payload.dt,
        displayedSafeLabel: payload.ds,
        promptText,
        promptIsHtml,
      };
      // Translate stored semantic role ("threshold" / "safe") back to the
      // displayed label this participant saw, so the frontend can pre-fill
      // its UI without needing to know about semantic roles.
      const semanticToDisplayed = (s: "threshold" | "safe" | null): string | null =>
        s === "threshold" ? payload.dt : s === "safe" ? payload.ds : null;
      const partial = row
        ? {
            personalChoiceDisplayed: semanticToDisplayed(row.personal_choice),
            publicRecommendationDisplayed: semanticToDisplayed(row.public_recommendation),
            dependentRecommendationDisplayed: semanticToDisplayed(row.dependent_recommendation),
            expectedMajorityDisplayed: semanticToDisplayed(row.expected_majority),
            confidence: row.confidence,
            reasonText: row.reason_text,
          }
        : undefined;
      const body: AssignResponse = {
        responseToken: existing,
        condition,
        ...(partial ? { partial } : {}),
      };
      return json(body);
    }
  }

  // Back-compat/session-restore path: older magic-link claims may have only
  // rb_preview, and results-page users can navigate back to / from that state.
  // A verified preview token is already bound to a submitted row, so recover
  // Done instead of issuing a fresh survey assignment.
  const preview = readCookie(cookieHeader, PREVIEW_COOKIE);
  if (preview) {
    const payload = await verifyToken(ctx.env.TOKEN_SECRET, preview);
    if (payload) {
      const row = await ctx.env.DB.prepare(
        `SELECT submitted_at, share_code, email, email_verified_at
           FROM responses WHERE token_id = ? LIMIT 1`,
      )
        .bind(payload.id)
        .first<{
          submitted_at: string | null;
          share_code: string | null;
          email: string | null;
          email_verified_at: string | null;
        }>();
      if (row?.submitted_at) {
        const body: AssignResponse = {
          alreadyVoted: true,
          verified: Boolean(row.email && row.email_verified_at),
          email: row.email ?? null,
          responseToken: preview,
          ...(row.share_code ? { shareCode: row.share_code } : {}),
        };
        const headers = new Headers();
        headers.append(
          "Set-Cookie",
          setCookie(ASSIGNMENT_COOKIE, preview, {
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
        return json(body, { headers });
      }
    }
  }

  // Pull optional referrer / campaign attribution from the request body and
  // (as a fallback) the HTTP Referer header. The frontend captures URL
  // params on first load and posts them here. We trim, length-cap, and only
  // persist string values — anything else is dropped silently.
  const refData = await readReferrerData(ctx.request);

  if ((await getPollStatus(ctx.env)) !== "open") {
    return error(409, "Poll is closed.");
  }

  // First time — assign and persist via cookie.
  const condition = randomizeCondition();
  const id = crypto.randomUUID();
  const responseToken = await signToken(ctx.env.TOKEN_SECRET, {
    id,
    iat: Date.now(),
    v: 1,
    frame: condition.mechanismFrame,
    salience: condition.salienceCondition,
    label: condition.labelCondition,
    order: condition.orderCondition,
    dt: condition.displayedThresholdLabel,
    ds: condition.displayedSafeLabel,
    ...refData,
  });

  const body: AssignResponse = { responseToken, condition };
  return json(body, {
    headers: {
      "Set-Cookie": setCookie(ASSIGNMENT_COOKIE, responseToken, {
        requestUrl: ctx.request.url,
        httpOnly: true,
        sameSite: "Lax",
        maxAgeSeconds: ASSIGNMENT_TTL_SECONDS,
      }),
    },
  });
};


/**
 * Read referrer / UTM params from the JSON request body, falling back to
 * the HTTP Referer header for the raw URL. Each value is trimmed and
 * truncated to 200 chars to bound payload size in the signed token.
 */
type RefData = {
  ref?: string;
  uts?: string;
  utm?: string;
  utc?: string;
  utn?: string;
  utt?: string;
  rfu?: string;
};
async function readReferrerData(request: Request): Promise<RefData> {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.clone().json()) as Record<string, unknown>;
  } catch {
    /* assign accepts empty body too */
  }
  const pick = (k: string): string | undefined => {
    const v = body[k];
    if (typeof v !== "string") return undefined;
    const t = v.trim().slice(0, 200);
    return t.length ? t : undefined;
  };
  const refererHeader = request.headers.get("referer")?.slice(0, 200) || undefined;
  const out: RefData = {};
  const ref = pick("ref");
  const utm_source = pick("utm_source");
  const utm_medium = pick("utm_medium");
  const utm_campaign = pick("utm_campaign");
  const utm_content = pick("utm_content");
  const utm_term = pick("utm_term");
  if (ref) out.ref = ref;
  if (utm_source) out.uts = utm_source;
  if (utm_medium) out.utm = utm_medium;
  if (utm_campaign) out.utc = utm_campaign;
  if (utm_content) out.utn = utm_content;
  if (utm_term) out.utt = utm_term;
  if (refererHeader) out.rfu = refererHeader;
  return out;
}