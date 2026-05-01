import type {
  AnswerRequest,
  SemanticChoice,
} from "../../../shared/types";
import { sha256Hex } from "../../_lib/crypto";
import type { RouteContext } from "../../_lib/env";
import { requireEnv } from "../../_lib/env";
import { error, json, methodNotAllowed } from "../../_lib/http";
import { getPollStatus } from "../../_lib/poll";
import { verifyToken } from "../../_lib/token";

export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);
  requireEnv(ctx.env);

  if ((await getPollStatus(ctx.env)) !== "open") return error(409, "Poll is closed.");

  let body: Partial<AnswerRequest>;
  try {
    body = (await ctx.request.json()) as Partial<AnswerRequest>;
  } catch {
    return error(400, "Invalid JSON body.");
  }

  const token = body.responseToken;
  if (typeof token !== "string") return error(400, "Missing responseToken.");
  const payload = await verifyToken(ctx.env.TOKEN_SECRET, token);
  if (!payload) return error(400, "Invalid responseToken.");

  // Translate any displayed choice into its semantic role using the
  // assignment-bound labels from the signed token. Ignore fields not present.
  const dt = payload.dt;
  const ds = payload.ds;
  const updates: Array<readonly [column: string, value: string | number]> = [];

  function semantic(value: unknown): SemanticChoice | null {
    if (typeof value !== "string") return null;
    const norm = value.trim().toLowerCase();
    if (norm === dt.toLowerCase()) return "threshold";
    if (norm === ds.toLowerCase()) return "safe";
    return null;
  }

  if (body.personalChoiceDisplayed !== undefined) {
    const s = semantic(body.personalChoiceDisplayed);
    if (!s) return error(400, "Invalid personalChoiceDisplayed.");
    updates.push(["personal_choice", s]);
  }
  if (body.publicRecommendationDisplayed !== undefined) {
    const s = semantic(body.publicRecommendationDisplayed);
    if (!s) return error(400, "Invalid publicRecommendationDisplayed.");
    updates.push(["public_recommendation", s]);
  }
  if (body.dependentRecommendationDisplayed !== undefined) {
    const s = semantic(body.dependentRecommendationDisplayed);
    if (!s) return error(400, "Invalid dependentRecommendationDisplayed.");
    updates.push(["dependent_recommendation", s]);
  }
  if (body.expectedMajorityDisplayed !== undefined) {
    const s = semantic(body.expectedMajorityDisplayed);
    if (!s) return error(400, "Invalid expectedMajorityDisplayed.");
    updates.push(["expected_majority", s]);
  }
  if (body.confidence !== undefined) {
    const n = Number(body.confidence);
    if (![1, 2, 3, 4, 5].includes(n)) return error(400, "confidence must be 1..5.");
    updates.push(["confidence", n]);
  }

  if (updates.length === 0) return error(400, "No answer fields provided.");

  // Hash IP and UA on first save. The INSERT OR IGNORE preserves these
  // first-touch values across subsequent partial saves.
  const ip =
    ctx.request.headers.get("CF-Connecting-IP") ??
    ctx.request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "";
  const ua = ctx.request.headers.get("User-Agent") ?? "";
  const ipHash = ip ? await sha256Hex(ip + "|" + ctx.env.IP_HASH_SALT) : null;
  const uaHash = ua ? await sha256Hex(ua + "|" + ctx.env.IP_HASH_SALT) : null;

  // 1. Ensure a row exists with the assignment-bound immutable fields.
  await ctx.env.DB.prepare(
    `INSERT OR IGNORE INTO responses (
       id, token_id, created_at, updated_at,
       mechanism_frame, salience_condition, label_condition, order_condition,
       displayed_threshold_label, displayed_safe_label,
       user_agent_hash, ip_hash,
       utm_source, utm_medium, utm_campaign, utm_content, utm_term,
       referrer_id, referer_url
     ) VALUES (?, ?, datetime('now'), datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      payload.id,
      payload.id,
      payload.frame,
      payload.salience,
      payload.label,
      payload.order,
      dt,
      ds,
      uaHash,
      ipHash,
      payload.uts ?? null,
      payload.utm ?? null,
      payload.utc ?? null,
      payload.utn ?? null,
      payload.utt ?? null,
      payload.ref ?? null,
      payload.rfu ?? null,
    )
    .run();

  // 2. Apply the answer fields. If the row is already submitted we no-op
  //    (changes === 0) and surface a 409.
  const setSql = [
    ...updates.map(([col]) => `${col} = ?`),
    "updated_at = datetime('now')",
  ].join(", ");
  const result = await ctx.env.DB.prepare(
    `UPDATE responses SET ${setSql} WHERE token_id = ? AND submitted_at IS NULL`,
  )
    .bind(...updates.map(([, v]) => v), payload.id)
    .run();

  if ((result.meta?.changes ?? 0) === 0) {
    return error(409, "Response already submitted.");
  }
  return json({ ok: true });
};
