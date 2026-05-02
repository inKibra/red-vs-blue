export type PollStatus = "open" | "closed";

export const MECHANISM_FRAMES = [
  "original",
  "neutral_outcome",
  "individual_payoff",
  "full_payoff_table",
] as const;
export type MechanismFrame = (typeof MECHANISM_FRAMES)[number];

export const SALIENCE_CONDITIONS = [
  "children_infirm_absent",
  "children_infirm_present",
] as const;
export type SalienceCondition = (typeof SALIENCE_CONDITIONS)[number];

export const LABEL_CONDITIONS = [
  "red_blue_original",
  "red_blue_swapped",
  "ab",
  "one_two",
] as const;
export type LabelCondition = (typeof LABEL_CONDITIONS)[number];

export const ORDER_CONDITIONS = ["success_first", "failure_first"] as const;
export type OrderCondition = (typeof ORDER_CONDITIONS)[number];

export type SemanticChoice = "threshold" | "safe";

export type AssignedCondition = {
  mechanismFrame: MechanismFrame;
  salienceCondition: SalienceCondition;
  labelCondition: LabelCondition;
  orderCondition: OrderCondition;
  /** Label shown to user for the threshold (blue-equivalent) option. */
  displayedThresholdLabel: string;
  /** Label shown to user for the safe (red-equivalent) option. */
  displayedSafeLabel: string;
  /** Fully rendered scenario prompt. May contain HTML for the payoff table. */
  promptText: string;
  /** True when promptText contains HTML (full_payoff_table frame). */
  promptIsHtml: boolean;
};

/**
 * Result of POST /api/poll/assign.
 *
 *  - `alreadyVoted: true`         — caller submitted previously (rb_voted cookie
 *                                  set, or DB row has submitted_at).
 *  - `partial` (when present)     — caller has an in-progress response with
 *                                  some answers already saved. Frontend uses
 *                                  this to resume at the first unanswered
 *                                  question and prefill confidence/reason.
 */
export type AssignPartial = {
  personalChoiceDisplayed: string | null;
  publicRecommendationDisplayed: string | null;
  dependentRecommendationDisplayed: string | null;
  expectedMajorityDisplayed: string | null;
  confidence: number | null;
  reasonText: string | null;
};

export type AssignResponse =
  | {
      alreadyVoted?: false;
      responseToken: string;
      condition: AssignedCondition;
      partial?: AssignPartial;
      /**
       * Present only when a partial response with `submitted_at` set already
       * exists — i.e., the row was finalized but cookie state put us back
       * here. Used by the Done page to surface the personal share link
       * without re-submitting.
       */
      shareCode?: string;
    }
  | {
      alreadyVoted: true;
      shareCode?: string;
      /**
       * The original signed response token, returned when the rb_assignment
       * cookie is still valid. Lets the client late-bind an email post-submit
       * (and re-render any token-driven UI) without needing a fresh row.
       */
      responseToken?: string;
      /**
       * Whether this row has both an email and email_verified_at set. The Done
       * page reads this so the SubscribeForm doesn't ambush already-verified
       * users on refresh, and the cohort "View your results" CTA routes
       * straight to /results.
       */
      verified: boolean;
      /** The email on file, when known. */
      email: string | null;
    };

/**
 * Per-stage incremental save. Send only the field(s) the participant just
 * locked in. Server upserts the responses row keyed on token_id.
 */
export type AnswerRequest = {
  responseToken: string;
  personalChoiceDisplayed?: string;
  publicRecommendationDisplayed?: string;
  dependentRecommendationDisplayed?: string;
  expectedMajorityDisplayed?: string;
  confidence?: number;
};

/**
 * Final-stage submission. All required answers must already be on file via
 * /api/poll/answer. Email is intentionally NOT collected here — see
 * SubscribeRequest for the post-submit value-exchange flow.
 */
export type SubmitRequest = {
  responseToken: string;
  reasonText?: string;
};

export type SubmitResponse = {
  ok: true;
  /** Total submitted responses including this one. */
  totalResponses: number;
  /**
   * Personal Crockford-base32 share code, minted on first successful submit.
   * Used to build the share link (?ref=<code>) and the cohort URL
   * (/c/<code>). Idempotent across re-submits.
   */
  shareCode: string;
};

/**
 * Post-submit subscription. Trades email + OTC verification for:
 *   - early access (sneak peek of live aggregate at /results)
 *   - notification when results officially publish
 *   - a stronger duplicate-vote signal in the analysis
 */
export type SubscribeRequest = {
  responseToken: string;
  email: string;
};

export type SubscribeResponse = {
  ok: true;
  awaitingVerification: true;
};

/**
 * First-time email verification on the Done page. The user just
 * subscribed and is typing the 6-digit OTC. /results re-auth uses a
 * separate magic-link flow (PreviewLinkRequest → GET /auth?key=).
 */
export type VerifyEmailRequest = {
  responseToken: string;
  code: string;
};

/**
 * Returning user requesting a one-click preview link to /results.
 * Server emails them a signed URL; clicking sets rb_preview and lands
 * on /results.
 */
export type PreviewLinkRequest = {
  email: string;
};

export type StatusResponse = {
  status: PollStatus;
  /** ISO 8601 timestamp; null when no scheduled close. */
  closesAt: string | null;
  /** ISO 8601 timestamp; non-null once admin has published results. */
  resultsPublishedAt: string | null;
  /** Live count of submitted responses. Always public. */
  totalResponses: number;
};

/** Public-facing topline results, available only once published. */
export type PublicResultsResponse = {
  /** True when this view is the unpublished sneak peek for verified subscribers. */
  preview: boolean;
  /** ISO 8601 publish timestamp; null in preview mode. */
  publishedAt: string | null;
  totalResponses: number;
  thresholdPercent: number;
  safePercent: number;
  averageConfidence: number;
  publicThresholdPercent: number;
  dependentThresholdPercent: number;
  /**
   * Personal cohort tree, attached only when the requester is authenticated
   * (verified rb_preview cookie) AND has a share_code of their own. Both the
   * world numbers above and the cohort numbers here are the same dataset
   * so the client can render them on a single page.
   */
  cohort: CohortResponse | null;
};
export type ChoiceTotals = { threshold: number; safe: number };

export type GroupRow<K extends string = string> = {
  key: K;
  n: number;
  personalChoice: ChoiceTotals;
  publicRecommendation: ChoiceTotals;
  dependentRecommendation: ChoiceTotals;
  expectedMajority: ChoiceTotals;
  averageConfidence: number;
};

export type CrossTabRow = {
  pattern: string;
  count: number;
  percent: number;
};

export type ResultsResponse = {
  status: PollStatus;
  totalResponses: number;
  overall: {
    personalChoice: ChoiceTotals;
    publicRecommendation: ChoiceTotals;
    dependentRecommendation: ChoiceTotals;
    expectedMajority: ChoiceTotals;
    averageConfidence: number;
  };
  byFrame: GroupRow<MechanismFrame>[];
  bySalience: GroupRow<SalienceCondition>[];
  byLabelCondition: GroupRow<LabelCondition>[];
  byOrderCondition: GroupRow<OrderCondition>[];
  crossTabs: {
    personalVsPublic: CrossTabRow[];
    personalVsDependent: CrossTabRow[];
  };
};


/**
 * Result of GET /api/cohort/:code.
 *
 * Tree counts are always returned (participation, not opinion).
 * `stats` is null when the cohort has fewer than `kAnonThreshold` submitted
 * descendants — the UI shows a "need N more" gate at that point.
 */
/** Threshold/safe split for one question on one row set. */
export type CohortSplit = {
  thresholdPercent: number;
  safePercent: number;
};

/**
 * One bucket of cohort respondents (e.g. all direct invitees, or the whole
 * cohort). When the bucket is below `kAnonThreshold`, `personal` and
 * `community` are null and the UI shows a locked placeholder. The `count`
 * is always shown — it's participation, not opinion.
 */
export type CohortBucket = {
  count: number;
  personal:  CohortSplit | null;  // "what would you press?"
  community: CohortSplit | null;  // "what should everyone press?"
  dependent: CohortSplit | null;  // "what would you tell a child to press?"
  expected:  CohortSplit | null;  // "what do you think most people will press?"
  averageConfidence: number | null;
};

/**
 * One node in the cohort tree, used by the constellation viz on /results.
 * The root node is the viewer themselves (depth 0, parent null); descendants
 * are walked from the recursive CTE, capped at MAX_NODES.
 */
export type CohortNode = {
  /** share_code of this respondent. */
  id: string;
  /** parent's share_code; null for the root viewer. */
  parent: string | null;
  /** 0 = viewer, 1 = direct, 2 = secondary, 3+ = deeper. */
  depth: number;
  /** null when row hasn't answered the personal-choice question. */
  personalChoice: "threshold" | "safe" | null;
};

export type CohortResponse = {
  code: string;
  tree: {
    direct: number;     // depth 1
    secondary: number;  // depth 2
    deeper: number;     // depth >= 3 (collapsed)
    total: number;      // direct + secondary + deeper
  };
  buckets: {
    total: CohortBucket;
    direct: CohortBucket;
    secondary: CohortBucket;
    deeper: CohortBucket;
  };
  world: {
    totalResponses: number;
    personal:  CohortSplit;
    community: CohortSplit;
    dependent: CohortSplit;
    expected:  CohortSplit;
  };
  /**
   * Edge list for the constellation viz. Includes the viewer (depth 0) and
   * up to MAX_NODES descendants. May be empty when the viewer has no
   * descendants yet — the viz then collapses to just the viewer node.
   */
  nodes: CohortNode[];
  kAnonThreshold: number;
};

/**
 * Public payload powering the /case-study page.
 *
 * Reveals condition-stratified percentages so readers can see how each
 * priming axis shifted answers. Cells with `n < minN` are returned with
 * `null` percentages — the case study UI renders those as a "too few" note
 * rather than a misleading point estimate.
 *
 * `dataAsOf` is the wall-clock at query time; the page shows it so the
 * reader knows the snapshot is live, not a frozen press release.
 */
export type CaseStudyResponse = {
  /** ISO 8601; matches the requesting handler's clock. */
  dataAsOf: string;
  /** ISO 8601; null until admin publishes the case study itself. */
  publishedAt: string | null;
  /** Min cell size below which percentages are suppressed. */
  minN: number;
  /** Headline number — every row in the responses table including starts that
      didn’t finish. Used wherever the page renders 'N people answered'. */
  totalResponses: number;
  /** Submitted-only count — the denominator behind every percentage on this
      payload. Surface this as a small clarifier so the reader can square the
      headline N with what the analysis is computed on. */
  analyzedCount: number;
  /**
   * The viewer's own share_code, when their cookie state lets us resolve it.
   * Used by the case-study CTA + cohort tease to render the user's share URL
   * (`/?ref=<code>`). Null when the request is gated to rb_voted=1 only or
   * when the row hasn't been submitted (no share_code minted yet).
   */
  viewerShareCode: string | null;
  /** Topline counts for the four 'who is asked' framings. */
  overall: {
    personalChoice: ChoiceTotals;
    publicRecommendation: ChoiceTotals;
    dependentRecommendation: ChoiceTotals;
    expectedMajority: ChoiceTotals;
    averageConfidence: number;
  };
  /** Per-condition cells. `pct` is null when n < minN. */
  byFrame: CaseStudyCell<MechanismFrame>[];
  bySalience: CaseStudyCell<SalienceCondition>[];
  byLabelCondition: CaseStudyCell<LabelCondition>[];
  byOrderCondition: CaseStudyCell<OrderCondition>[];
};

/**
 * One condition cell for the case study. Captures the four answer
 * percentages plus average confidence and denominator. `pct` fields are
 * null when the cell hasn't reached `minN`.
 */
export type CaseStudyCell<K extends string = string> = {
  key: K;
  n: number;
  personalChoiceThresholdPct: number | null;
  publicRecommendationThresholdPct: number | null;
  dependentRecommendationThresholdPct: number | null;
  expectedMajorityThresholdPct: number | null;
  averageConfidence: number | null;
};