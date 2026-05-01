import type { CohortBucket, CohortNode, CohortResponse, CohortSplit } from "../../shared/types";

/** Below this many submitted responses (per bucket), hide that bucket's stats. */
export const K_ANON = 3;
/** Defensive recursion cap; pathological-cycle insurance. */
const MAX_DEPTH = 10;
/** Hard ceiling on nodes returned to the constellation viz (root + descendants). */
const MAX_NODES = 60;

type DescendantRow = {
  share_code: string;
  referrer_id: string | null;
  depth: number;
  personal_choice: "threshold" | "safe" | null;
  public_recommendation: "threshold" | "safe" | null;
  dependent_recommendation: "threshold" | "safe" | null;
  expected_majority: "threshold" | "safe" | null;
  confidence: number | null;
};

type WorldRow = {
  total: number;
  p_t: number; p_s: number;
  c_t: number; c_s: number;
  d_t: number; d_s: number;
  e_t: number; e_s: number;
};

/**
 * Build the descendant tree for a given share_code and aggregate it into
 * the wire-format CohortResponse (minus the `code` field — caller fills that).
 *
 * Walks the referrer chain with a recursive CTE; each depth bucket is
 * independently k-anonymity-gated. Bucket sizes are always returned (they
 * describe participation, not opinion); the personal/community/dependent/
 * expected splits are returned as null when the bucket is below K_ANON.
 */
export async function buildCohortAggregate(
  db: D1Database,
  code: string,
): Promise<Omit<CohortResponse, "code">> {
  const { results: rows = [] } = await db
    .prepare(
      `
WITH RECURSIVE descendants(share_code, depth) AS (
  SELECT share_code, 1
    FROM responses
    WHERE referrer_id = ? AND share_code IS NOT NULL
  UNION ALL
  SELECT r.share_code, d.depth + 1
    FROM responses r
    JOIN descendants d ON r.referrer_id = d.share_code
    WHERE r.share_code IS NOT NULL AND d.depth < ${MAX_DEPTH}
)
SELECT d.share_code AS share_code,
       d.depth AS depth,
       r.referrer_id              AS referrer_id,
       r.personal_choice           AS personal_choice,
       r.public_recommendation     AS public_recommendation,
       r.dependent_recommendation  AS dependent_recommendation,
       r.expected_majority         AS expected_majority,
       r.confidence                AS confidence
FROM descendants d
JOIN responses r ON r.share_code = d.share_code
WHERE r.submitted_at IS NOT NULL
`,
    )
    .bind(code)
    .all<DescendantRow>();

  // Root node: the viewer themselves. Surfaced separately because the
  // recursive CTE above only walks descendants. We need depth=0 for the
  // constellation viz to anchor everything.
  const rootRow = await db
    .prepare(
      `SELECT share_code, personal_choice
         FROM responses
         WHERE share_code = ? AND submitted_at IS NOT NULL
         LIMIT 1`,
    )
    .bind(code)
    .first<{ share_code: string; personal_choice: "threshold" | "safe" | null }>();

  const worldRow = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN personal_choice          = 'threshold' THEN 1 ELSE 0 END) AS p_t,
         SUM(CASE WHEN personal_choice          = 'safe'      THEN 1 ELSE 0 END) AS p_s,
         SUM(CASE WHEN public_recommendation    = 'threshold' THEN 1 ELSE 0 END) AS c_t,
         SUM(CASE WHEN public_recommendation    = 'safe'      THEN 1 ELSE 0 END) AS c_s,
         SUM(CASE WHEN dependent_recommendation = 'threshold' THEN 1 ELSE 0 END) AS d_t,
         SUM(CASE WHEN dependent_recommendation = 'safe'      THEN 1 ELSE 0 END) AS d_s,
         SUM(CASE WHEN expected_majority        = 'threshold' THEN 1 ELSE 0 END) AS e_t,
         SUM(CASE WHEN expected_majority        = 'safe'      THEN 1 ELSE 0 END) AS e_s
       FROM responses WHERE submitted_at IS NOT NULL`,
    )
    .first<WorldRow>();

  const direct = rows.filter((r) => r.depth === 1);
  const secondary = rows.filter((r) => r.depth === 2);
  const deeper = rows.filter((r) => r.depth >= 3);

  return {
    tree: {
      direct: direct.length,
      secondary: secondary.length,
      deeper: deeper.length,
      total: rows.length,
    },
    buckets: {
      total:     bucket(rows),
      direct:    bucket(direct),
      secondary: bucket(secondary),
      deeper:    bucket(deeper),
    },
    world: {
      totalResponses: worldRow?.total ?? 0,
      personal:  split(worldRow?.p_t ?? 0, worldRow?.p_s ?? 0),
      community: split(worldRow?.c_t ?? 0, worldRow?.c_s ?? 0),
      dependent: split(worldRow?.d_t ?? 0, worldRow?.d_s ?? 0),
      expected:  split(worldRow?.e_t ?? 0, worldRow?.e_s ?? 0),
    },
    nodes: buildNodes(rootRow, rows),
    kAnonThreshold: K_ANON,
  };
}

/**
 * Flatten the recursive-CTE rows + viewer root into a stable node list for
 * the constellation viz. Truncated at MAX_NODES so a viral cohort doesn't
 * blow the wire payload; truncation is breadth-first by depth so the shallow
 * (most relatable) layers are always preserved.
 */
function buildNodes(
  root: { share_code: string; personal_choice: "threshold" | "safe" | null } | null,
  rows: DescendantRow[],
): CohortNode[] {
  const out: CohortNode[] = [];
  if (root) {
    out.push({
      id: root.share_code,
      parent: null,
      depth: 0,
      personalChoice: root.personal_choice,
    });
  }
  // Sort by depth and stable id so truncation preserves the closest layers
  // without request-to-request jitter inside a layer.
  const sorted = [...rows].sort((a, b) =>
    a.depth - b.depth || a.share_code.localeCompare(b.share_code),
  );
  for (const r of sorted) {
    if (out.length >= MAX_NODES) break;
    out.push({
      id: r.share_code,
      parent: r.referrer_id,
      depth: r.depth,
      personalChoice: r.personal_choice,
    });
  }
  return out;
}

function bucket(rows: DescendantRow[]): CohortBucket {
  const count = rows.length;
  if (count < K_ANON) {
    return {
      count,
      personal: null, community: null, dependent: null, expected: null,
      averageConfidence: null,
    };
  }
  const tally = (col: keyof DescendantRow): CohortSplit => {
    const t = rows.filter((r) => r[col] === "threshold").length;
    const s = rows.filter((r) => r[col] === "safe").length;
    return split(t, s);
  };
  const confSum = rows.reduce((a, r) => a + (r.confidence ?? 0), 0);
  return {
    count,
    personal:  tally("personal_choice"),
    community: tally("public_recommendation"),
    dependent: tally("dependent_recommendation"),
    expected:  tally("expected_majority"),
    averageConfidence:
      count === 0 ? null : Math.round((confSum / count) * 100) / 100,
  };
}

/** Threshold/safe → percentages, rounded to 0.1%. Renormalizes so they sum to 100. */
function split(t: number, s: number): CohortSplit {
  const total = t + s;
  if (total === 0) return { thresholdPercent: 0, safePercent: 0 };
  const tp = Math.round((t / total) * 1000) / 10;
  return { thresholdPercent: tp, safePercent: Math.round((100 - tp) * 10) / 10 };
}
