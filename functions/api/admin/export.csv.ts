import { isAdminAuthenticated } from "../../_lib/auth";
import type { RouteContext } from "../../_lib/env";
import { requireEnv } from "../../_lib/env";
import { error, methodNotAllowed } from "../../_lib/http";

const COLUMNS = [
  "id",
  "createdAt",
  "submittedAt",
  "frame",
  "childrenInfirmSalience",
  "labelCondition",
  "orderCondition",
  "displayedThresholdLabel",
  "displayedSafeLabel",
  "personalChoice",
  "publicRecommendation",
  "dependentRecommendation",
  "expectedMajority",
  "confidence",
  "reasonText",
  "email",
  "emailVerifiedAt",
  "userAgentHash",
  "ipHash",
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
  "referrerId",
  "refererUrl",
];

type Row = {
  id: string;
  created_at: string;
  submitted_at: string | null;
  mechanism_frame: string;
  salience_condition: string;
  label_condition: string;
  order_condition: string;
  displayed_threshold_label: string;
  displayed_safe_label: string;
  personal_choice: string | null;
  public_recommendation: string | null;
  dependent_recommendation: string | null;
  expected_majority: string | null;
  confidence: number | null;
  reason_text: string | null;
  email: string | null;
  email_verified_at: string | null;
  user_agent_hash: string | null;
  ip_hash: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer_id: string | null;
  referer_url: string | null;
};

export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "GET") return methodNotAllowed(["GET"]);
  requireEnv(ctx.env);
  if (!(await isAdminAuthenticated(ctx.request, ctx.env.TOKEN_SECRET))) {
    return error(401, "Not authenticated.");
  }

  // ?include=all dumps partials too. Default is submitted-only.
  const url = new URL(ctx.request.url);
  const includeAll = url.searchParams.get("include") === "all";
  const filter = includeAll ? "" : "WHERE submitted_at IS NOT NULL";

  const { results } = await ctx.env.DB.prepare(
    `SELECT id, created_at, submitted_at, mechanism_frame, salience_condition,
            label_condition, order_condition, displayed_threshold_label,
            displayed_safe_label, personal_choice, public_recommendation,
            dependent_recommendation, expected_majority, confidence,
            reason_text, email, email_verified_at, user_agent_hash, ip_hash,
            utm_source, utm_medium, utm_campaign, utm_content, utm_term,
            referrer_id, referer_url
     FROM responses ${filter}
     ORDER BY created_at ASC`,
  ).all<Row>();

  const rows = results ?? [];
  const out: string[] = [COLUMNS.join(",")];
  for (const r of rows) {
    out.push(
      [
        r.id,
        r.created_at,
        r.submitted_at ?? "",
        r.mechanism_frame,
        r.salience_condition,
        r.label_condition,
        r.order_condition,
        r.displayed_threshold_label,
        r.displayed_safe_label,
        r.personal_choice ?? "",
        r.public_recommendation ?? "",
        r.dependent_recommendation ?? "",
        r.expected_majority ?? "",
        r.confidence == null ? "" : String(r.confidence),
        r.reason_text ?? "",
        r.email ?? "",
        r.email_verified_at ?? "",
        r.user_agent_hash ?? "",
        r.ip_hash ?? "",
        r.utm_source ?? "",
        r.utm_medium ?? "",
        r.utm_campaign ?? "",
        r.utm_content ?? "",
        r.utm_term ?? "",
        r.referrer_id ?? "",
        r.referer_url ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  return new Response(out.join("\n") + "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="responses.csv"',
      "Cache-Control": "no-store",
    },
  });
};

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}
