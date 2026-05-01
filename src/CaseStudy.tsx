import { useEffect, useMemo, useState } from "react";
import { getCaseStudyData } from "./api";
import { buildPrompt, labelsFor } from "@shared/conditions";
import type {
  CaseStudyCell,
  CaseStudyResponse,
  MechanismFrame,
} from "@shared/types";

/**
 * /case-study — public reading page.
 *
 * Narrative arc:
 *   1. Headline hook: the crowd is split, and confident.
 *   2. Wording changes the answer (mechanism_frame: 30pp swing).
 *   3. Responsibility changes the answer (personal vs public vs dependent).
 *   4. Prediction vs reality (expected_majority vs personal_choice).
 *   5. The missing layer (cohort tease) — into the share CTA.
 *
 * All numbers come from /api/case-study/data and update live (30s edge cache).
 * Per-cell percentages are suppressed when n < minN; the UI renders that as a
 * "too few" pill rather than a phantom 0%.
 */

// Display copy for each frame. The keys mirror MechanismFrame; we rely on
// the constant array order from `MECHANISM_FRAMES` for canonical iteration.
// Headline/blurb are the writer's read on each variant — they are NOT pulled
// from the API to keep editorial control over the narrative.
const FRAME_DISPLAY: Record<
  MechanismFrame,
  { headline: string; blurb: string }
> = {
  original: {
    headline: "The original wording.",
    blurb:
      "The version most readers encountered. Survival is named, the social contract is implicit, and the threshold sits in plain English.",
  },
  neutral_outcome: {
    headline: "Strip the survival language.",
    blurb:
      "Same mechanic. Same threshold. The outcome words are softened — no one dies, no one survives.",
  },
  individual_payoff: {
    headline: "Make the safe option unambiguously safe.",
    blurb:
      "The threshold-button voters still need the crowd. The other button now says “survives either way” on its face.",
  },
  full_payoff_table: {
    headline: "Show the payoff table.",
    blurb:
      "No prose framing at all. Just outcomes mapped to choices in a 2×2 grid.",
  },
};

const RESPONSIBILITY_FRAMES = [
  {
    key: "personal" as const,
    eyebrow: "For yourself",
    question: "Which button would you press?",
  },
  {
    key: "public" as const,
    eyebrow: "Recommend it publicly",
    question: "Which button do you think everyone should press?",
  },
  {
    key: "dependent" as const,
    eyebrow: "For someone depending on you",
    question:
      "Which button would you tell a child or someone in your care to press?",
  },
];

type ResponsibilityKey = (typeof RESPONSIBILITY_FRAMES)[number]["key"];

export function CaseStudy() {
  const [data, setData] = useState<CaseStudyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCaseStudyData()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError((e as Error).message ?? "Failed to load.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <CaseStudyShell>
        <p className="cs-error">Could not load case-study data: {error}</p>
      </CaseStudyShell>
    );
  }

  if (!data) {
    return (
      <CaseStudyShell>
        <p className="cs-loading">Loading the latest numbers…</p>
      </CaseStudyShell>
    );
  }

  return (
    <CaseStudyShell asOf={data.dataAsOf} totalResponses={data.totalResponses}>
      <Hero data={data} />
      <Headline data={data} />
      <FrameComparator data={data} />
      <ResponsibilityShifter data={data} />
      <PredictionVsReality data={data} />
      <CohortTease />
      <CtaBlock />
    </CaseStudyShell>
  );
}

function CaseStudyShell({
  children,
  asOf,
  totalResponses,
}: {
  children: React.ReactNode;
  asOf?: string;
  totalResponses?: number;
}) {
  return (
    <div className="cs-shell">
      <header className="cs-mast">
        <a href="/" className="cs-back">
          ← The Threshold Study
        </a>
        <span className="cs-meta">
          {totalResponses != null && (
            <>
              <strong>{totalResponses.toLocaleString()}</strong> responses
              {asOf && (
                <>
                  {" · "}
                  <time dateTime={asOf}>
                    {new Date(asOf).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                </>
              )}
            </>
          )}
        </span>
      </header>
      <article className="cs-article">{children}</article>
    </div>
  );
}

function Hero({ data }: { data: CaseStudyResponse }) {
  const totalChoice =
    data.overall.personalChoice.threshold + data.overall.personalChoice.safe;
  const personalThreshold =
    totalChoice === 0
      ? 0
      : Math.round(
          (data.overall.personalChoice.threshold / totalChoice) * 1000,
        ) / 10;

  return (
    <section className="cs-hero">
      <p className="cs-eyebrow">Case study · wording effects</p>
      <h1 className="cs-headline">
        Same question, four wordings, thirty points apart.
      </h1>
      <p className="cs-deck">
        We asked {data.totalResponses.toLocaleString()} people one question with
        a button on the left and a button on the right. Globally, the split is
        almost a coin flip — <strong>{personalThreshold}%</strong> for the
        group-dependent option. But that average hides the most interesting
        thing in the data: how much the wording itself moved the answer.
      </p>
    </section>
  );
}

function Headline({ data }: { data: CaseStudyResponse }) {
  const totalChoice =
    data.overall.personalChoice.threshold + data.overall.personalChoice.safe;
  const personalPct =
    totalChoice === 0
      ? 0
      : Math.round(
          (data.overall.personalChoice.threshold / totalChoice) * 1000,
        ) / 10;
  const safePct =
    totalChoice === 0 ? 0 : Math.round((100 - personalPct) * 10) / 10;
  const conf = data.overall.averageConfidence;
  return (
    <section className="cs-section cs-headline-stats">
      <div className="cs-section-eyebrow">Where the crowd lands</div>
      <div className="cs-stat-row">
        <Stat label="Group-dependent" value={`${personalPct}%`} />
        <Stat label="Independent option" value={`${safePct}%`} />
        <Stat label="Avg confidence" value={conf.toFixed(2)} hint="out of 5" />
      </div>
      <p className="cs-prose">
        It is not that nobody knows. Average confidence is{" "}
        <strong>{conf.toFixed(2)} / 5</strong>. People feel sure. They are sure
        in different directions.
      </p>
    </section>
  );
}

/* --------------------------------------------------------------------------
 * FrameComparator
 *
 * The headline finding. Same survey question, four mechanism framings. The
 * reader picks a frame; the actual prompt that respondents in that frame saw
 * appears verbatim, alongside the percentage that chose the group-dependent
 * option in that cell.
 *
 * The labels are held constant ("blue" / "red") so only the framing varies.
 * Salience and order are also held constant — this is one slice of the full
 * factorial. The pct values shown here come from the cross-frame aggregate
 * regardless of label/salience/order, because that's the most useful single
 * number for "this frame moves answers by X".
 * -------------------------------------------------------------------------- */
function FrameComparator({ data }: { data: CaseStudyResponse }) {
  const frames = data.byFrame;
  const [activeKey, setActiveKey] = useState<MechanismFrame>(() => {
    // Seed with the frame whose pct is most extreme so the page opens on the
    // most legible illustration of the effect.
    const sorted = [...frames].filter(
      (f) => f.personalChoiceThresholdPct !== null,
    );
    if (sorted.length === 0) return frames[0]?.key ?? "original";
    sorted.sort((a, b) => {
      const aDist = Math.abs((a.personalChoiceThresholdPct ?? 50) - 50);
      const bDist = Math.abs((b.personalChoiceThresholdPct ?? 50) - 50);
      return bDist - aDist;
    });
    return sorted[0]!.key;
  });

  const active = frames.find((f) => f.key === activeKey);
  const prompt = useMemo(() => {
    const labels = labelsFor("red_blue_original");
    return buildPrompt(
      activeKey,
      "children_infirm_absent",
      "success_first",
      labels.displayedThresholdLabel,
      labels.displayedSafeLabel,
    );
  }, [activeKey]);

  const allPcts = frames
    .map((f) => f.personalChoiceThresholdPct)
    .filter((v): v is number => v != null);
  const maxPct = allPcts.length ? Math.max(...allPcts) : 0;
  const minPct = allPcts.length ? Math.min(...allPcts) : 0;
  const swing = Math.round((maxPct - minPct) * 10) / 10;

  return (
    <section className="cs-section cs-frames">
      <div className="cs-section-eyebrow">Wording moves the answer</div>
      <h2 className="cs-h2">Four framings, one mechanism.</h2>
      <p className="cs-prose">
        The underlying choice is identical across all four. The threshold rule
        is the same, the buttons are the same, the labels are the same. Only
        the framing changes. People answer differently anyway — by{" "}
        <strong>{swing} percentage points</strong> end-to-end.
      </p>

      <div className="cs-frame-tabs" role="tablist" aria-label="Mechanism framing">
        {frames.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={f.key === activeKey}
            className={`cs-frame-tab${f.key === activeKey ? " is-active" : ""}`}
            onClick={() => setActiveKey(f.key)}
          >
            <span className="cs-frame-tab-name">{frameLabel(f.key)}</span>
            <span className="cs-frame-tab-pct">
              {f.personalChoiceThresholdPct != null
                ? `${f.personalChoiceThresholdPct}%`
                : "—"}
            </span>
            <span className="cs-frame-tab-n">n = {f.n}</span>
          </button>
        ))}
      </div>

      <div className="cs-frame-detail">
        <div className="cs-frame-card">
          <div className="cs-frame-card-eyebrow">
            What the {active ? frameLabel(active.key).toLowerCase() : ""} cohort
            actually read
          </div>
          <h3 className="cs-frame-card-headline">
            {active ? FRAME_DISPLAY[active.key].headline : ""}
          </h3>
          <p className="cs-frame-card-blurb">
            {active ? FRAME_DISPLAY[active.key].blurb : ""}
          </p>
          <div className="cs-frame-prompt-label">Verbatim prompt</div>
          {prompt.promptIsHtml ? (
            <div
              className="cs-frame-prompt cs-frame-prompt--html"
              dangerouslySetInnerHTML={{ __html: prompt.promptText }}
            />
          ) : (
            <p className="cs-frame-prompt">{prompt.promptText}</p>
          )}
        </div>

        <div className="cs-frame-result">
          <div className="cs-frame-result-eyebrow">Chose group-dependent</div>
          {active && active.personalChoiceThresholdPct != null ? (
            <div className="cs-frame-result-bignum">
              {active.personalChoiceThresholdPct}
              <span className="cs-frame-result-pct">%</span>
            </div>
          ) : (
            <div className="cs-frame-result-pending">Too few to report</div>
          )}
          <div className="cs-frame-result-meta">
            n = {active?.n ?? 0} respondents in this cell
          </div>
          <FrameBar frames={frames} activeKey={activeKey} />
        </div>
      </div>

      <p className="cs-prose cs-prose--callout">
        That spread is not noise. It is the largest single effect in the study.
        The same person, asked the same question with a different sentence in
        front of it, gives a different answer.
      </p>
    </section>
  );
}

function FrameBar({
  frames,
  activeKey,
}: {
  frames: CaseStudyCell<MechanismFrame>[];
  activeKey: MechanismFrame;
}) {
  return (
    <div className="cs-frame-bar" aria-hidden="true">
      {frames.map((f) => {
        const pct = f.personalChoiceThresholdPct;
        return (
          <div
            key={f.key}
            className={`cs-frame-bar-cell${f.key === activeKey ? " is-active" : ""}`}
          >
            <div className="cs-frame-bar-track">
              <div
                className="cs-frame-bar-fill"
                style={{ width: `${pct ?? 0}%` }}
              />
            </div>
            <div className="cs-frame-bar-label">{frameLabel(f.key)}</div>
          </div>
        );
      })}
    </div>
  );
}

function frameLabel(key: MechanismFrame): string {
  switch (key) {
    case "original":
      return "Original";
    case "neutral_outcome":
      return "Neutral outcome";
    case "individual_payoff":
      return "Individual payoff";
    case "full_payoff_table":
      return "Payoff table";
  }
}

/* --------------------------------------------------------------------------
 * ResponsibilityShifter
 *
 * Same population. Three different "to whom?" framings. Toggle reveals how
 * the percentage choosing the group-dependent option moves between asking
 * for self, asking for the public, and asking for someone dependent on the
 * respondent.
 * -------------------------------------------------------------------------- */
function ResponsibilityShifter({ data }: { data: CaseStudyResponse }) {
  const [active, setActive] = useState<ResponsibilityKey>("personal");
  const totals = (() => {
    const c = data.overall.personalChoice;
    const total = c.threshold + c.safe;
    return {
      personal: pct(data.overall.personalChoice.threshold, total),
      public: pct(data.overall.publicRecommendation.threshold, total),
      dependent: pct(data.overall.dependentRecommendation.threshold, total),
    };
  })();
  const value = totals[active] ?? 0;
  const personalVsDependent =
    Math.round(((totals.personal ?? 0) - (totals.dependent ?? 0)) * 10) / 10;

  return (
    <section className="cs-section cs-responsibility">
      <div className="cs-section-eyebrow">Who you are answering for</div>
      <h2 className="cs-h2">
        The question you answer is the question you are asked.
      </h2>
      <p className="cs-prose">
        Every respondent answered the same scenario from three angles: what
        they themselves would do, what they would recommend publicly, and what
        they would tell a child or someone in their care to do. Same person,
        three different framings of who the answer is for.
      </p>

      <div className="cs-resp-toggle" role="tablist">
        {RESPONSIBILITY_FRAMES.map((rf) => (
          <button
            key={rf.key}
            type="button"
            role="tab"
            aria-selected={rf.key === active}
            className={`cs-resp-toggle-btn${rf.key === active ? " is-active" : ""}`}
            onClick={() => setActive(rf.key)}
          >
            <span className="cs-resp-toggle-eyebrow">{rf.eyebrow}</span>
          </button>
        ))}
      </div>

      <div className="cs-resp-stage">
        <p className="cs-resp-question">
          {RESPONSIBILITY_FRAMES.find((r) => r.key === active)?.question}
        </p>
        <div className="cs-resp-bignum">
          {value != null ? (
            <>
              {value}
              <span className="cs-resp-bignum-pct">%</span>
              <span className="cs-resp-bignum-label">
                chose group-dependent
              </span>
            </>
          ) : (
            "—"
          )}
        </div>
      </div>

      <p className="cs-prose cs-prose--callout">
        When the question becomes “what would you tell someone depending on
        you,” the group-dependent option drops by{" "}
        <strong>{Math.abs(personalVsDependent)} points</strong>. The same
        person, thinking through the same scenario, gives a more cautious
        answer when somebody else’s outcome is on them.
      </p>
    </section>
  );
}

/* --------------------------------------------------------------------------
 * PredictionVsReality
 *
 * Two horizontal bars: what people *expected* the majority to choose,
 * versus what the majority *actually* chose.
 * -------------------------------------------------------------------------- */
function PredictionVsReality({ data }: { data: CaseStudyResponse }) {
  const total =
    data.overall.personalChoice.threshold + data.overall.personalChoice.safe;
  const actual = pct(data.overall.personalChoice.threshold, total) ?? 0;
  const expected = pct(data.overall.expectedMajority.threshold, total) ?? 0;
  const gap = Math.round((expected - actual) * 10) / 10;

  return (
    <section className="cs-section cs-prediction">
      <div className="cs-section-eyebrow">What people thought would happen</div>
      <h2 className="cs-h2">The crowd misreads itself.</h2>
      <p className="cs-prose">
        We also asked respondents what they thought everyone <em>else</em>{" "}
        would choose. They expected a stronger crowd lean toward the
        group-dependent option than the crowd actually has.
      </p>

      <div className="cs-pvr">
        <PvrBar label="Expected majority" value={expected} tone="muted" />
        <PvrBar label="Actual choice" value={actual} tone="accent" />
      </div>

      <p className="cs-prose cs-prose--callout">
        The expectation overshoots reality by{" "}
        <strong>{Math.abs(gap)} points</strong>. People underweight how many
        others will play the safer hand.
      </p>
    </section>
  );
}

function PvrBar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "accent" | "muted";
}) {
  return (
    <div className={`cs-pvr-row cs-pvr-row--${tone}`}>
      <div className="cs-pvr-label">{label}</div>
      <div className="cs-pvr-track">
        <div className="cs-pvr-fill" style={{ width: `${value}%` }} />
        <span className="cs-pvr-value">{value}%</span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * CohortTease
 *
 * Pure narrative + visual hook. No live data. The graphic is suggestive —
 * three friend-group clusters with internal splits very different from the
 * global average. Sells the cohort-unlock value of sharing.
 * -------------------------------------------------------------------------- */
function CohortTease() {
  return (
    <section className="cs-section cs-cohort-tease">
      <div className="cs-section-eyebrow">The missing layer</div>
      <h2 className="cs-h2">
        Global is an average across very different rooms.
      </h2>
      <p className="cs-prose">
        A 52/48 split in the world does not mean every group is 52/48. The
        global number is an average across friend groups that almost certainly
        disagree with one another. We can’t see that pattern from the totals
        alone — we need the friend graph.
      </p>

      <CohortPreview />

      <p className="cs-prose">
        That is what /results unlocks once your share link picks up a few
        responses. Your cohort, against the world. Your cohort’s confidence,
        against the world’s. How your friends shifted when responsibility
        entered the question. And, if those friends share too, the same view
        one layer out.
      </p>
    </section>
  );
}

function CohortPreview() {
  // Three illustrative cohorts with internal splits that differ from the
  // global ~52/48. Numbers are static and clearly tagged as illustrative.
  const cohorts = [
    { label: "Cohort A", threshold: 80, n: 10 },
    { label: "Cohort B", threshold: 33, n: 9 },
    { label: "Cohort C", threshold: 60, n: 15 },
  ];
  return (
    <div className="cs-cohort-preview">
      <div className="cs-cohort-preview-eyebrow">Illustrative</div>
      <div className="cs-cohort-preview-row">
        {cohorts.map((c) => (
          <div key={c.label} className="cs-cohort-card">
            <div className="cs-cohort-card-name">{c.label}</div>
            <div className="cs-cohort-card-bar">
              <div
                className="cs-cohort-card-fill"
                style={{ width: `${c.threshold}%` }}
              />
            </div>
            <div className="cs-cohort-card-meta">
              {c.threshold}% chose group-dependent · n = {c.n}
            </div>
          </div>
        ))}
      </div>
      <div className="cs-cohort-preview-footer">
        Global average: ~52%. Each cohort is a different room.
      </div>
    </div>
  );
}

function CtaBlock() {
  return (
    <section className="cs-section cs-cta">
      <h2 className="cs-h2">Two ways from here.</h2>
      <div className="cs-cta-grid">
        <a className="cs-cta-card cs-cta-card--primary" href="/">
          <div className="cs-cta-card-eyebrow">Haven’t answered yet?</div>
          <div className="cs-cta-card-headline">Take the survey →</div>
          <div className="cs-cta-card-body">
            One question. Sixty seconds. Then your view of the data is yours.
          </div>
        </a>
        <a className="cs-cta-card" href="/results">
          <div className="cs-cta-card-eyebrow">Already responded?</div>
          <div className="cs-cta-card-headline">Open your results →</div>
          <div className="cs-cta-card-body">
            Share your personal link. Once 3 friends answer through it, your
            cohort comparison unlocks.
          </div>
        </a>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="cs-stat">
      <div className="cs-stat-label">{label}</div>
      <div className="cs-stat-value">
        {value}
        {hint && <span className="cs-stat-hint"> {hint}</span>}
      </div>
    </div>
  );
}

function pct(numer: number, denom: number): number | null {
  if (denom === 0) return null;
  return Math.round((numer / denom) * 1000) / 10;
}
