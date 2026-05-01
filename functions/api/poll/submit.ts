import type { SubmitRequest, SubmitResponse } from "../../../shared/types";
import { setCookie } from "../../_lib/cookie";
import type { RouteContext } from "../../_lib/env";
import { requireEnv } from "../../_lib/env";
import { error, json, methodNotAllowed } from "../../_lib/http";
import { getPollStatus } from "../../_lib/poll";
import { verifyToken } from "../../_lib/token";
import { assignShareCode } from "../../_lib/share-code";

const REASON_MAX = 500;

type ExistingRow = {
  personal_choice: string | null;
  public_recommendation: string | null;
  dependent_recommendation: string | null;
  expected_majority: string | null;
  confidence: number | null;
  submitted_at: string | null;
};

/**
 * Finalize a response. The required answers must already be on file via
 * /api/poll/answer. Email subscription is decoupled — it lives at
 * /api/poll/subscribe and is offered as a value-exchange after submit.
 */
export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);
  requireEnv(ctx.env);

  if ((await getPollStatus(ctx.env)) !== "open") return error(409, "Poll is closed.");

  let body: Partial<SubmitRequest>;
  try {
    body = (await ctx.request.json()) as Partial<SubmitRequest>;
  } catch {
    return error(400, "Invalid JSON body.");
  }

  const token = body.responseToken;
  if (typeof token !== "string") return error(400, "Missing responseToken.");
  const payload = await verifyToken(ctx.env.TOKEN_SECRET, token);
  if (!payload) return error(400, "Invalid responseToken.");

  const row = await ctx.env.DB.prepare(
    `SELECT personal_choice, public_recommendation, dependent_recommendation,
            expected_majority, confidence, submitted_at
     FROM responses WHERE token_id = ?`,
  )
    .bind(payload.id)
    .first<ExistingRow>();
  if (!row) return error(409, "No answers recorded yet.");
  if (row.submitted_at) return error(409, "Already submitted.");
  if (
    !row.personal_choice ||
    !row.public_recommendation ||
    !row.dependent_recommendation ||
    !row.expected_majority ||
    row.confidence == null
  ) {
    return error(400, "Missing required answers.");
  }

  let reason: string | null = null;
  if (typeof body.reasonText === "string") {
    const trimmed = body.reasonText.trim();
    if (trimmed.length > 0) {
      if (trimmed.length > REASON_MAX) {
        return error(400, `reasonText must be <= ${REASON_MAX} chars.`);
      }
      reason = trimmed;
    }
  }

  const result = await ctx.env.DB.prepare(
    `UPDATE responses
     SET submitted_at = datetime('now'),
         updated_at = datetime('now'),
         reason_text = ?
     WHERE token_id = ? AND submitted_at IS NULL`,
  )
    .bind(reason, payload.id)
    .run();

  if ((result.meta?.changes ?? 0) === 0) {
    return error(409, "Already submitted.");
  }

  // Mint a share_code on first successful submit. assignShareCode is
  // idempotent: re-running it on an already-coded row returns the existing
  // code rather than overwriting. The code is what powers /c/<code> and
  // the personal share link.
  const shareCode = await assignShareCode(ctx.env.DB, payload.id);

  // Count everyone who has started a response (matches /api/poll/status).
  // The Done page renders "You're 1 of N" — N includes partials so freshly-
  // submitted users see themselves and any in-flight peers.
  const countRow = await ctx.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM responses`,
  ).first<{ n: number }>();

  const responseBody: SubmitResponse = {
    ok: true,
    totalResponses: countRow?.n ?? 0,
    shareCode,
  };
  return json(responseBody, {
    headers: {
      "Set-Cookie": setCookie("rb_voted", "1", {
        requestUrl: ctx.request.url,
        httpOnly: false,
        sameSite: "Lax",
        maxAgeSeconds: 180 * 24 * 60 * 60,
      }),
    },
  });
};
