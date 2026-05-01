import type { CohortBucket, CohortNode, CohortResponse } from "@shared/types";

/**
 * Build a credible illustrative CohortResponse for use in:
 *   - the /case-study cohort tease (showing what /results unlocks)
 *   - the /results locked-state preview (showing the same to a user who
 *     hasn't shared yet)
 *
 * Tree shape: 8 direct + 5 second-degree + 2 deeper. The deeper bucket sits
 * below K_ANON=3 so the locked-bucket UX renders too — the reader sees both
 * the unlocked panels (total/direct/secondary) and the locked panel (deeper)
 * exactly as the live page would render them.
 *
 * Numbers are fictional and the surrounding UI tags this as illustrative.
 */
export function buildSampleCohort(): CohortResponse {
  const directNodes: CohortNode[] = Array.from({ length: 8 }, (_, i) => ({
    id: `D${i}`,
    parent: "ROOT",
    depth: 1,
    personalChoice: i < 6 ? "threshold" : "safe",
  }));
  const secondaryNodes: CohortNode[] = Array.from({ length: 5 }, (_, i) => ({
    id: `S${i}`,
    parent: `D${i % 4}`,
    depth: 2,
    personalChoice: i < 3 ? "threshold" : "safe",
  }));
  const deeperNodes: CohortNode[] = Array.from({ length: 2 }, (_, i) => ({
    id: `X${i}`,
    parent: `S${i % 3}`,
    depth: 3,
    personalChoice: "threshold",
  }));

  const totalBucket: CohortBucket = {
    count: 15,
    personal: { thresholdPercent: 71, safePercent: 29 },
    community: { thresholdPercent: 75, safePercent: 25 },
    dependent: { thresholdPercent: 50, safePercent: 50 },
    expected: { thresholdPercent: 80, safePercent: 20 },
    averageConfidence: 4.4,
  };
  const directBucket: CohortBucket = {
    count: 8,
    personal: { thresholdPercent: 75, safePercent: 25 },
    community: { thresholdPercent: 78, safePercent: 22 },
    dependent: { thresholdPercent: 56, safePercent: 44 },
    expected: { thresholdPercent: 84, safePercent: 16 },
    averageConfidence: 4.5,
  };
  const secondaryBucket: CohortBucket = {
    count: 5,
    personal: { thresholdPercent: 60, safePercent: 40 },
    community: { thresholdPercent: 65, safePercent: 35 },
    dependent: { thresholdPercent: 40, safePercent: 60 },
    expected: { thresholdPercent: 70, safePercent: 30 },
    averageConfidence: 4.2,
  };
  // Below K_ANON=3 so the live page locks this bucket. Showing the locked
  // state in the preview is intentional — readers should see the gate.
  const deeperBucket: CohortBucket = {
    count: 2,
    personal: null,
    community: null,
    dependent: null,
    expected: null,
    averageConfidence: null,
  };

  return {
    code: "ILLUSTRATIVE",
    tree: { direct: 8, secondary: 5, deeper: 2, total: 15 },
    buckets: {
      total: totalBucket,
      direct: directBucket,
      secondary: secondaryBucket,
      deeper: deeperBucket,
    },
    world: {
      totalResponses: 223,
      personal: { thresholdPercent: 52, safePercent: 48 },
      community: { thresholdPercent: 54, safePercent: 46 },
      dependent: { thresholdPercent: 44, safePercent: 56 },
      expected: { thresholdPercent: 58, safePercent: 42 },
    },
    nodes: [
      { id: "ROOT", parent: null, depth: 0, personalChoice: "threshold" },
      ...directNodes,
      ...secondaryNodes,
      ...deeperNodes,
    ],
    kAnonThreshold: 3,
  };
}
