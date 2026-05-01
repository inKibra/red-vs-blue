import {
  LABEL_CONDITIONS,
  MECHANISM_FRAMES,
  ORDER_CONDITIONS,
  SALIENCE_CONDITIONS,
  type ChoiceTotals,
  type CrossTabRow,
  type GroupRow,
  type LabelCondition,
  type MechanismFrame,
  type OrderCondition,
  type ResultsResponse,
  type SalienceCondition,
  type SemanticChoice,
} from "../../../shared/types";
import { isAdminAuthenticated } from "../../_lib/auth";
import type { RouteContext } from "../../_lib/env";
import { requireEnv } from "../../_lib/env";
import { error, json, methodNotAllowed } from "../../_lib/http";
import { getPollStatus } from "../../_lib/poll";

type ResponseRow = {
  mechanism_frame: MechanismFrame;
  salience_condition: SalienceCondition;
  label_condition: LabelCondition;
  order_condition: OrderCondition;
  personal_choice: SemanticChoice;
  public_recommendation: SemanticChoice;
  dependent_recommendation: SemanticChoice;
  expected_majority: SemanticChoice;
  confidence: number;
};

export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "GET") return methodNotAllowed(["GET"]);
  requireEnv(ctx.env);
  if (!(await isAdminAuthenticated(ctx.request, ctx.env.TOKEN_SECRET))) {
    return error(401, "Not authenticated.");
  }

  const status = await getPollStatus(ctx.env);

  const { results } = await ctx.env.DB.prepare(
    `SELECT mechanism_frame, salience_condition, label_condition, order_condition,
            personal_choice, public_recommendation, dependent_recommendation,
            expected_majority, confidence
     FROM responses WHERE submitted_at IS NOT NULL`,
  ).all<ResponseRow>();

  const rows = results ?? [];
  const total = rows.length;

  const overall = {
    personalChoice: emptyTotals(),
    publicRecommendation: emptyTotals(),
    dependentRecommendation: emptyTotals(),
    expectedMajority: emptyTotals(),
    averageConfidence: 0,
  };
  let conf = 0;

  for (const r of rows) {
    overall.personalChoice[r.personal_choice]++;
    overall.publicRecommendation[r.public_recommendation]++;
    overall.dependentRecommendation[r.dependent_recommendation]++;
    overall.expectedMajority[r.expected_majority]++;
    conf += r.confidence;
  }
  overall.averageConfidence = total === 0 ? 0 : round(conf / total, 3);

  const byFrame = groupBy(rows, MECHANISM_FRAMES, (r) => r.mechanism_frame);
  const bySalience = groupBy(rows, SALIENCE_CONDITIONS, (r) => r.salience_condition);
  const byLabelCondition = groupBy(rows, LABEL_CONDITIONS, (r) => r.label_condition);
  const byOrderCondition = groupBy(rows, ORDER_CONDITIONS, (r) => r.order_condition);

  const personalVsPublic = crossTab(
    rows,
    (r) => r.personal_choice,
    (r) => r.public_recommendation,
    "I",
    "everyone",
  );
  const personalVsDependent = crossTab(
    rows,
    (r) => r.personal_choice,
    (r) => r.dependent_recommendation,
    "I",
    "child/dependent",
  );

  const body: ResultsResponse = {
    status,
    totalResponses: total,
    overall,
    byFrame,
    bySalience,
    byLabelCondition,
    byOrderCondition,
    crossTabs: { personalVsPublic, personalVsDependent },
  };
  return json(body);
};

function emptyTotals(): ChoiceTotals {
  return { threshold: 0, safe: 0 };
}

function round(n: number, places: number): number {
  const m = Math.pow(10, places);
  return Math.round(n * m) / m;
}

function groupBy<K extends string>(
  rows: ResponseRow[],
  keys: readonly K[],
  pick: (r: ResponseRow) => K,
): GroupRow<K>[] {
  const acc = new Map<K, GroupRow<K>>();
  for (const k of keys) {
    acc.set(k, {
      key: k,
      n: 0,
      personalChoice: emptyTotals(),
      publicRecommendation: emptyTotals(),
      dependentRecommendation: emptyTotals(),
      expectedMajority: emptyTotals(),
      averageConfidence: 0,
    });
  }
  const confSums = new Map<K, number>();
  for (const r of rows) {
    const k = pick(r);
    const g = acc.get(k);
    if (!g) continue;
    g.n++;
    g.personalChoice[r.personal_choice]++;
    g.publicRecommendation[r.public_recommendation]++;
    g.dependentRecommendation[r.dependent_recommendation]++;
    g.expectedMajority[r.expected_majority]++;
    confSums.set(k, (confSums.get(k) ?? 0) + r.confidence);
  }
  for (const [k, g] of acc) {
    g.averageConfidence = g.n === 0 ? 0 : round((confSums.get(k) ?? 0) / g.n, 3);
  }
  return keys.map((k) => acc.get(k)!);
}

function crossTab(
  rows: ResponseRow[],
  a: (r: ResponseRow) => SemanticChoice,
  b: (r: ResponseRow) => SemanticChoice,
  selfLabel: string,
  otherLabel: string,
): CrossTabRow[] {
  const counts = { tt: 0, ts: 0, st: 0, ss: 0 };
  for (const r of rows) {
    const ka = a(r);
    const kb = b(r);
    if (ka === "threshold" && kb === "threshold") counts.tt++;
    else if (ka === "threshold" && kb === "safe") counts.ts++;
    else if (ka === "safe" && kb === "threshold") counts.st++;
    else counts.ss++;
  }
  const total = rows.length;
  const pct = (n: number) => (total === 0 ? 0 : round((n / total) * 100, 2));
  return [
    {
      pattern: `${selfLabel} choose threshold, ${otherLabel} threshold`,
      count: counts.tt,
      percent: pct(counts.tt),
    },
    {
      pattern: `${selfLabel} choose threshold, ${otherLabel} safe`,
      count: counts.ts,
      percent: pct(counts.ts),
    },
    {
      pattern: `${selfLabel} choose safe, ${otherLabel} threshold`,
      count: counts.st,
      percent: pct(counts.st),
    },
    {
      pattern: `${selfLabel} choose safe, ${otherLabel} safe`,
      count: counts.ss,
      percent: pct(counts.ss),
    },
  ];
}
