import type { PublicResultsResponse } from "../../../shared/types";
import { buildCohortAggregate } from "../../_lib/cohort";
import { readCookie } from "../../_lib/cookie";
import type { RouteContext } from "../../_lib/env";
import { requireEnv } from "../../_lib/env";
import { error, json, methodNotAllowed } from "../../_lib/http";
import { getPollSettings } from "../../_lib/poll";
import { verifyToken } from "../../_lib/token";

type AggRow = {
  total: number;
  threshold: number;
  safe: number;
  public_threshold: number;
  dependent_threshold: number;
  conf_sum: number;
};

/**
 * GET /api/poll/results
 *
 * Three view states:
 *  - **Anonymous, results unpublished**: 404 (with a hint to verify email).
 *  - **Verified subscriber, results unpublished**: live preview, returns world
 *    aggregate AND (when the requester has a share_code) their cohort tree.
 *    `preview: true` so the client labels the page accordingly.
 *  - **Anyone, results published**: world aggregate, no cohort. The cohort
 *    section is only shown to authed callers; published-mode callers don't
 *    have a tied identity to look up.
 *
 * The cohort merge happens inline here (not on a separate endpoint) so that a
 * verified subscriber sees one canonical "their results" page.
 */
export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "GET") return methodNotAllowed(["GET"]);
  requireEnv(ctx.env);

  const settings = await getPollSettings(ctx.env);
  let preview = false;
  let viewerShareCode: string | null = null;

  // Auth gate. The cookie's underlying row must have email_verified_at set.
  // We capture the row's share_code on the same lookup so we can attach the
  // cohort aggregate without a second query.
  const cookieToken = readCookie(ctx.request.headers.get("Cookie"), "rb_preview");
  if (cookieToken) {
    const payload = await verifyToken(ctx.env.TOKEN_SECRET, cookieToken);
    if (payload) {
      const row = await ctx.env.DB.prepare(
        `SELECT email_verified_at, share_code FROM responses WHERE token_id = ?`,
      )
        .bind(payload.id)
        .first<{ email_verified_at: string | null; share_code: string | null }>();
      if (row?.email_verified_at) {
        preview = !settings.resultsPublishedAt;
        viewerShareCode = row.share_code;
      } else if (!settings.resultsPublishedAt) {
        return error(403, "Email not verified.");
      }
    } else if (!settings.resultsPublishedAt) {
      return error(401, "Preview token invalid.");
    }
  } else if (!settings.resultsPublishedAt) {
    return error(404, "Results have not been published.");
  }

  const row = await ctx.env.DB.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN personal_choice = 'threshold' THEN 1 ELSE 0 END) AS threshold,
       SUM(CASE WHEN personal_choice = 'safe' THEN 1 ELSE 0 END) AS safe,
       SUM(CASE WHEN public_recommendation = 'threshold' THEN 1 ELSE 0 END) AS public_threshold,
       SUM(CASE WHEN dependent_recommendation = 'threshold' THEN 1 ELSE 0 END) AS dependent_threshold,
       COALESCE(SUM(confidence), 0) AS conf_sum
     FROM responses
     WHERE submitted_at IS NOT NULL`,
  ).first<AggRow>();

  const total = row?.total ?? 0;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10);

  // Cohort is attached only when the viewer is authenticated AND has earned a
  // share_code (i.e. they completed the survey themselves). Anonymous published
  // viewers don't get one — we have no identity to attach.
  const cohort = viewerShareCode
    ? { code: viewerShareCode, ...(await buildCohortAggregate(ctx.env.DB, viewerShareCode)) }
    : null;

  const body: PublicResultsResponse = {
    preview,
    publishedAt: settings.resultsPublishedAt,
    totalResponses: total,
    thresholdPercent: pct(row?.threshold ?? 0),
    safePercent: pct(row?.safe ?? 0),
    averageConfidence:
      total === 0 ? 0 : Math.round(((row?.conf_sum ?? 0) / total) * 100) / 100,
    publicThresholdPercent: pct(row?.public_threshold ?? 0),
    dependentThresholdPercent: pct(row?.dependent_threshold ?? 0),
    cohort,
  };

  return json(body, {
    headers: {
      // Authed views are personalised (cohort, preview state) → no caching.
      // Published anonymous views are publicly cacheable for 30s.
      "Cache-Control": cookieToken
        ? "private, no-store"
        : preview
          ? "private, no-store"
          : "public, max-age=30",
    },
  });
};
