import { isAdminAuthenticated } from "../../_lib/auth";
import { sendEmail } from "../../_lib/email";
import type { RouteContext } from "../../_lib/env";
import { requireEnv } from "../../_lib/env";
import { error, json, methodNotAllowed } from "../../_lib/http";
import { publishResults } from "../../_lib/poll";

type AggRow = {
  total: number;
  threshold: number;
  safe: number;
  public_threshold: number;
  dependent_threshold: number;
  conf_sum: number;
};

type SubscriberRow = { token_id: string; email: string };

/**
 * Publish results and queue notification emails for everyone who confirmed
 * their email address. Idempotent: re-running won't double-send because each
 * row's `results_email_sent_at` is updated atomically.
 */
export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);
  requireEnv(ctx.env);
  if (!(await isAdminAuthenticated(ctx.request, ctx.env.TOKEN_SECRET))) {
    return error(401, "Not authenticated.");
  }

  const publishedAt = await publishResults(ctx.env);

  // Compute topline once.
  const agg = await ctx.env.DB.prepare(
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

  const total = agg?.total ?? 0;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10);
  const props = {
    totalResponses: total,
    thresholdPercent: pct(agg?.threshold ?? 0),
    safePercent: pct(agg?.safe ?? 0),
    publicThresholdPercent: pct(agg?.public_threshold ?? 0),
    dependentThresholdPercent: pct(agg?.dependent_threshold ?? 0),
    averageConfidence:
      total === 0 ? 0 : Math.round(((agg?.conf_sum ?? 0) / total) * 100) / 100,
    resultsUrl: `${new URL(ctx.request.url).origin}/results`,
  };

  // Verified subscribers who haven't received the notification yet.
  const { results } = await ctx.env.DB.prepare(
    `SELECT token_id, email
     FROM responses
     WHERE email IS NOT NULL
       AND email_verified_at IS NOT NULL
       AND results_email_sent_at IS NULL`,
  ).all<SubscriberRow>();

  const subscribers = results ?? [];
  let sent = 0;
  let failed = 0;
  for (const s of subscribers) {
    try {
      await sendEmail(ctx.env, {
        to: s.email,
        subject: "The Threshold Study — results are in",
        template: { kind: "results", props },
      });
      await ctx.env.DB.prepare(
        `UPDATE responses
         SET results_email_sent_at = datetime('now')
         WHERE token_id = ?`,
      )
        .bind(s.token_id)
        .run();
      sent++;
    } catch (e) {
      failed++;
      console.error(
        `results email failed for ${s.token_id}:`,
        (e as Error).message,
      );
    }
  }

  return json({
    ok: true,
    publishedAt,
    notifiedSubscribers: sent,
    failedSubscribers: failed,
  });
};
