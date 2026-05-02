import { isAdminAuthenticated } from "../../_lib/auth";
import { sendEmail } from "../../_lib/email";
import type { RouteContext } from "../../_lib/env";
import { requireEnv } from "../../_lib/env";
import { error, json, methodNotAllowed } from "../../_lib/http";
import { signUnsubscribeLink } from "../../_lib/unsubscribe-link";

// Display labels and stable ordering for the four mechanism frames. Order
// matches the case-study FrameComparator so the email reads in the same
// sequence the published analysis does.
const FRAME_DISPLAY: Record<string, { label: string; order: number }> = {
  original:           { label: "Original",          order: 0 },
  neutral_outcome:    { label: "Spare prose",       order: 1 },
  individual_payoff:  { label: "Individual payoff", order: 2 },
  full_payoff_table:  { label: "Payoff table",      order: 3 },
};

type FrameRow = { mechanism_frame: string; n: number; thresh: number };

type AggRow = {
  total: number | null;
  personal_threshold: number | null;
  public_threshold: number | null;
  dependent_threshold: number | null;
  expected_threshold: number | null;
  conf_sum: number | null;
};

type SubscriberRow = {
  token_id: string;
  email: string;
  share_code: string;
};

type RequestBody = { apply?: unknown; onlyEmail?: unknown };

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const first = local[0] ?? "*";
  return `${first}***${domain.slice(-Math.min(domain.length, 8))}`;
}

export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);
  requireEnv(ctx.env);
  if (!(await isAdminAuthenticated(ctx.request, ctx.env.TOKEN_SECRET))) {
    return error(401, "Not authenticated.");
  }

  let body: RequestBody = {};
  try {
    const text = await ctx.request.text();
    body = text ? (JSON.parse(text) as RequestBody) : {};
  } catch {
    return error(400, "Invalid JSON body.");
  }
  const apply = body.apply === true;
  // onlyEmail — single-recipient test mode. When set, the eligibility query
  // result is filtered to that one email so the admin can fire a real-inbox
  // fidelity test (Gmail/Apple Mail rendering, List-Unsubscribe header,
  // dark-mode color inversion) before the full blast. Idempotency stamp still
  // applies, so the test recipient won’t double-receive when the real blast
  // runs later.
  const onlyEmail =
    typeof body.onlyEmail === "string" && body.onlyEmail.includes("@")
      ? body.onlyEmail.trim().toLowerCase()
      : null;

  const agg = await ctx.env.DB.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN personal_choice = 'threshold' THEN 1 ELSE 0 END) AS personal_threshold,
       SUM(CASE WHEN public_recommendation = 'threshold' THEN 1 ELSE 0 END) AS public_threshold,
       SUM(CASE WHEN dependent_recommendation = 'threshold' THEN 1 ELSE 0 END) AS dependent_threshold,
       SUM(CASE WHEN expected_majority = 'threshold' THEN 1 ELSE 0 END) AS expected_threshold,
       COALESCE(SUM(confidence), 0) AS conf_sum
     FROM responses
     WHERE submitted_at IS NOT NULL`,
  ).first<AggRow>();

  // analyzedCount = fully-submitted only; this is the denominator for every
  // percentage and the average. totalResponses = all rows including the
  // 'started but didn’t finish' tail so the headline number reads bigger and
  // matches what a recipient thinks of as 'how many people answered'.
  const analyzedCount = agg?.total ?? 0;
  const totalRow = await ctx.env.DB.prepare(
    `SELECT COUNT(*) AS total FROM responses`,
  ).first<{ total: number | null }>();
  const totalResponses = totalRow?.total ?? 0;
  const pct = (n: number) =>
    analyzedCount === 0 ? 0 : Math.round((n / analyzedCount) * 1000) / 10;
  const personalChoiceThresholdPct = pct(agg?.personal_threshold ?? 0);
  const dependentRecommendationThresholdPct = pct(agg?.dependent_threshold ?? 0);
  const averageConfidence =
    analyzedCount === 0
      ? 0
      : Math.round(((agg?.conf_sum ?? 0) / analyzedCount) * 100) / 100;

  // Per-frame personal-choice split for the email's chart. Filter to known
  // frames so a stale value can't sneak into the rendered email.
  const frameRowsRaw = await ctx.env.DB.prepare(
    `SELECT mechanism_frame,
            COUNT(*) AS n,
            SUM(CASE WHEN personal_choice = 'threshold' THEN 1 ELSE 0 END) AS thresh
       FROM responses
      WHERE submitted_at IS NOT NULL
        AND mechanism_frame IS NOT NULL
      GROUP BY mechanism_frame`,
  ).all<FrameRow>();
  const frameSwing = (frameRowsRaw.results ?? [])
    .filter((r) => FRAME_DISPLAY[r.mechanism_frame] != null)
    .map((r) => ({
      label: FRAME_DISPLAY[r.mechanism_frame]!.label,
      pct: r.n === 0 ? 0 : Math.round((r.thresh / r.n) * 1000) / 10,
      n: r.n,
      _order: FRAME_DISPLAY[r.mechanism_frame]!.order,
    }))
    .sort((a, b) => a._order - b._order)
    .map(({ label, pct, n }) => ({ label, pct, n }));

  const { results } = await ctx.env.DB.prepare(
    `SELECT token_id, email, share_code
     FROM responses
     WHERE email IS NOT NULL
       AND email_verified_at IS NOT NULL
       AND preliminary_email_sent_at IS NULL
       AND unsubscribed_at IS NULL
       AND share_code IS NOT NULL`,
  ).all<SubscriberRow>();
  let allSubscribers = results ?? [];
  if (onlyEmail) {
    allSubscribers = allSubscribers.filter(
      (s) => s.email.trim().toLowerCase() === onlyEmail,
    );
  }
  const subscribers = allSubscribers;
  const origin = new URL(ctx.request.url).origin;

  if (!apply) {
    return json({
      ok: true,
      dryRun: true,
      totalResponses,
      eligibleRecipients: subscribers.length,
      sample: subscribers.slice(0, 3).map((s) => ({
        email: maskEmail(s.email),
        shareCode: s.share_code,
      })),
    });
  }

  let sent = 0;
  let failed = 0;
  for (const s of subscribers) {
    const shareUrl = `${origin}/?ref=${s.share_code}`;
    const caseStudyUrl = `${origin}/case-study`;
    const unsubscribeToken = await signUnsubscribeLink(
      ctx.env.TOKEN_SECRET,
      s.token_id,
      s.email,
    );
    const unsubscribeUrl = `${origin}/unsubscribe?key=${encodeURIComponent(unsubscribeToken)}`;

    try {
      await sendEmail(ctx.env, {
        to: s.email,
        subject: `Preliminary results: ${totalResponses} answers in. We just need 3 more.`,
        template: {
          kind: "preliminary",
          props: {
            totalResponses,
            analyzedCount,
            personalChoiceThresholdPct,
            dependentRecommendationThresholdPct,
            averageConfidence,
            frameSwing,
            shareUrl,
            caseStudyUrl,
            unsubscribeUrl,
          },
        },
        unsubscribeUrl,
      });
      await ctx.env.DB.prepare(
        `UPDATE responses
         SET preliminary_email_sent_at = datetime('now')
         WHERE token_id = ?`,
      )
        .bind(s.token_id)
        .run();
      sent++;
    } catch (e) {
      failed++;
      console.error(
        `preliminary email failed for ${s.token_id}:`,
        (e as Error).message,
      );
    }
  }

  return json({ ok: true, dryRun: false, totalResponses, sent, failed });
};
