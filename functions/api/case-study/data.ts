import { readCookie } from "../../_lib/cookie";
import type { RouteContext } from "../../_lib/env";
import { requireEnv } from "../../_lib/env";
import { error, json, methodNotAllowed } from "../../_lib/http";
import { verifyToken } from "../../_lib/token";
import type {
  CaseStudyResponse,
  CaseStudyCell,
  LabelCondition,
  MechanismFrame,
  OrderCondition,
  SalienceCondition,
} from "../../../shared/types";
import {
  LABEL_CONDITIONS,
  MECHANISM_FRAMES,
  ORDER_CONDITIONS,
  SALIENCE_CONDITIONS,
} from "../../../shared/types";

const minN = 12;

type SettingsRow = {
  case_study_published_at: string | null;
};

type ToplineRow = {
  total: number | null;
  pct: number | null;
  psc: number | null;
  prt: number | null;
  prs: number | null;
  drt: number | null;
  drs: number | null;
  emt: number | null;
  ems: number | null;
  conf_sum: number | null;
};

type ConditionRow<K extends string> = {
  k: K | null;
  n: number | null;
  personal_threshold: number | null;
  public_threshold: number | null;
  dependent_threshold: number | null;
  expected_threshold: number | null;
  conf_sum: number | null;
};

const pct = (numer: number, denom: number): number | null =>
  denom === 0 ? null : Math.round((numer / denom) * 1000) / 10;

const cellPct = (numer: number, denom: number, n: number): number | null =>
  n < minN ? null : pct(numer, denom);

export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "GET") return methodNotAllowed(["GET"]);
  requireEnv(ctx.env);

  // Gate: only respondents see the case study payload. The page reveals the
  // experimental design (by-frame breakdown, label effects, etc.); reading
  // it before answering would prime the next response. We accept any of the
  // three cookies that mark a respondent: rb_voted (set on submit AND on
  // magic-link claim), rb_assignment (canonical response token), or
  // rb_preview (verified subscriber). The discriminating field tells the
  // client to render the "take the survey first" gate.
  const cookies = ctx.request.headers.get("Cookie");
  const voted = readCookie(cookies, "rb_voted") === "1";
  const assignment = readCookie(cookies, "rb_assignment");
  const preview = readCookie(cookies, "rb_preview");
  const hasResponded = voted || assignment !== null || preview !== null;
  if (!hasResponded) {
    return error(403, "Take the survey first.");
  }

  // Resolve the viewer's share_code from whichever signed token cookie they
  // have. Used by the case-study CTA + cohort tease to render their share
  // URL. rb_voted=1 alone has no row reference, so falls back to null.
  const viewerShareCode = await resolveShareCode(ctx, assignment ?? preview);
  try {
    const [settings, topline, byFrame, bySalience, byLabelCondition, byOrderCondition] =
      await Promise.all([
        ctx.env.DB.prepare(
          `SELECT case_study_published_at FROM poll_settings WHERE id = 1`,
        ).first<SettingsRow>(),
        getTopline(ctx.env.DB),
        getConditionCells<MechanismFrame>(ctx.env.DB, "mechanism_frame", MECHANISM_FRAMES),
        getConditionCells<SalienceCondition>(ctx.env.DB, "salience_condition", SALIENCE_CONDITIONS),
        getConditionCells<LabelCondition>(ctx.env.DB, "label_condition", LABEL_CONDITIONS),
        getConditionCells<OrderCondition>(ctx.env.DB, "order_condition", ORDER_CONDITIONS),
      ]);

    const total = topline.total ?? 0;
    const payload = {
      dataAsOf: new Date().toISOString(),
      publishedAt: settings?.case_study_published_at ?? null,
      minN,
      totalResponses: total,
      viewerShareCode,
      overall: {
        personalChoice: { threshold: topline.pct ?? 0, safe: topline.psc ?? 0 },
        publicRecommendation: { threshold: topline.prt ?? 0, safe: topline.prs ?? 0 },
        dependentRecommendation: { threshold: topline.drt ?? 0, safe: topline.drs ?? 0 },
        expectedMajority: { threshold: topline.emt ?? 0, safe: topline.ems ?? 0 },
        averageConfidence:
          total === 0 ? 0 : Math.round(((topline.conf_sum ?? 0) / total) * 100) / 100,
      },
      byFrame,
      bySalience,
      byLabelCondition,
      byOrderCondition,
    } satisfies CaseStudyResponse;

    const response = json(payload);
    response.headers.set("Cache-Control", "public, max-age=30, s-maxage=30");
    return response;
  } catch (err) {
    console.error("Failed to build case-study data", err);
    return error(500, "Failed to load case-study data.");
  }
};

async function getTopline(db: D1Database): Promise<ToplineRow> {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN personal_choice = 'threshold' THEN 1 ELSE 0 END) AS pct,
         SUM(CASE WHEN personal_choice = 'safe' THEN 1 ELSE 0 END) AS psc,
         SUM(CASE WHEN public_recommendation = 'threshold' THEN 1 ELSE 0 END) AS prt,
         SUM(CASE WHEN public_recommendation = 'safe' THEN 1 ELSE 0 END) AS prs,
         SUM(CASE WHEN dependent_recommendation = 'threshold' THEN 1 ELSE 0 END) AS drt,
         SUM(CASE WHEN dependent_recommendation = 'safe' THEN 1 ELSE 0 END) AS drs,
         SUM(CASE WHEN expected_majority = 'threshold' THEN 1 ELSE 0 END) AS emt,
         SUM(CASE WHEN expected_majority = 'safe' THEN 1 ELSE 0 END) AS ems,
         COALESCE(SUM(confidence), 0) AS conf_sum
       FROM responses
       WHERE submitted_at IS NOT NULL`,
    )
    .first<ToplineRow>();

  return (
    row ?? {
      total: 0,
      pct: 0,
      psc: 0,
      prt: 0,
      prs: 0,
      drt: 0,
      drs: 0,
      emt: 0,
      ems: 0,
      conf_sum: 0,
    }
  );
}

async function getConditionCells<K extends string>(
  db: D1Database,
  column: "mechanism_frame" | "salience_condition" | "label_condition" | "order_condition",
  keys: readonly K[],
): Promise<CaseStudyCell<K>[]> {
  const { results } = await db
    .prepare(
      `SELECT ${column} AS k,
              COUNT(*) AS n,
              SUM(CASE WHEN personal_choice = 'threshold' THEN 1 ELSE 0 END) AS personal_threshold,
              SUM(CASE WHEN public_recommendation = 'threshold' THEN 1 ELSE 0 END) AS public_threshold,
              SUM(CASE WHEN dependent_recommendation = 'threshold' THEN 1 ELSE 0 END) AS dependent_threshold,
              SUM(CASE WHEN expected_majority = 'threshold' THEN 1 ELSE 0 END) AS expected_threshold,
              COALESCE(SUM(confidence), 0) AS conf_sum
         FROM responses
         WHERE submitted_at IS NOT NULL
         GROUP BY ${column}`,
    )
    .all<ConditionRow<K>>();

  const rowsByKey = new Map<K, ConditionRow<K>>();
  for (const row of results ?? []) {
    if (row.k !== null && keySetHas(keys, row.k)) rowsByKey.set(row.k, row);
  }

  return keys.map((key) => toCell(key, rowsByKey.get(key)));
}

function keySetHas<K extends string>(keys: readonly K[], value: string): value is K {
  return (keys as readonly string[]).includes(value);
}

function toCell<K extends string>(key: K, row: ConditionRow<K> | undefined): CaseStudyCell<K> {
  const n = row?.n ?? 0;
  const confSum = row?.conf_sum ?? 0;

  return {
    key,
    n,
    personalChoiceThresholdPct: cellPct(row?.personal_threshold ?? 0, n, n),
    publicRecommendationThresholdPct: cellPct(row?.public_threshold ?? 0, n, n),
    dependentRecommendationThresholdPct: cellPct(row?.dependent_threshold ?? 0, n, n),
    expectedMajorityThresholdPct: cellPct(row?.expected_threshold ?? 0, n, n),
    averageConfidence: n < minN ? null : Math.round((confSum / n) * 100) / 100,
  };
}


/**
 * Decode a signed ResponseToken (`rb_assignment` or `rb_preview` cookie) and
 * look up the corresponding row's share_code. Returns null if the token is
 * missing, malformed, expired, or if the row hasn't been submitted yet (in
 * which case there's no share_code to surface).
 *
 * Failure modes are squashed to null because the caller doesn't need to
 * distinguish them: missing share_code just means the case-study CTA falls
 * back to a generic share without a ?ref= attribution param.
 */
async function resolveShareCode(
  ctx: RouteContext,
  cookieToken: string | null,
): Promise<string | null> {
  if (!cookieToken) return null;
  const payload = await verifyToken(ctx.env.TOKEN_SECRET, cookieToken);
  if (!payload) return null;
  const row = await ctx.env.DB.prepare(
    `SELECT share_code FROM responses WHERE token_id = ? AND submitted_at IS NOT NULL`,
  )
    .bind(payload.id)
    .first<{ share_code: string | null }>();
  return row?.share_code ?? null;
}