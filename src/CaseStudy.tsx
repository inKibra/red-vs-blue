import { useEffect, useMemo, useState } from "react";
import { getCaseStudyData } from "./api";
import { buildPrompt, labelsFor } from "@shared/conditions";
import type {
  CaseStudyResponse,
  LabelCondition,
  MechanismFrame,
  OrderCondition,
  SalienceCondition,
} from "@shared/types";

/**
 * /case-study — public reading page.
 *
 * Narrative arc (in render order):
 *   1. Hero + color legend.
 *   2. Topline stats (where the crowd lands overall).
 *   3. FrameComparator — the headline finding (mechanism_frame, ~30pp).
 *   4. LabelComparator — second-order finding (label_condition, ~14pp).
 *   5. SecondaryVariations — order_condition (null) + salience (small).
 *   6. ResponsibilityShifter — same person, three "to whom?" framings.
 *   7. PredictionVsReality — what the crowd expected vs what it did.
 *   8. CohortTease — the missing layer, into the share CTA.
 *   9. WhatElseCouldVary — honest list of dimensions we did NOT vary.
 *  10. CtaBlock.
 *
 * Chart-color convention used throughout the page:
 *   - blue fill  = % chose the group-dependent / "threshold" option
 *   - red fill   = % chose the individual / "safe" option
 *
 * The survey itself intentionally never colors the buttons — the experimental
 * UI is fully neutral. The colors here are this case study's chart encoding,
 * mapping back to the original "blue button / red button" framing of the
 * scenario. The ColorLegend below the hero says this explicitly so a careful
 * reader doesn't mistake it for a stimulus color cue.
 */

// ---------------------------------------------------------------------------
// Frame display copy
//
// MUST stay accurate to what the rendered prompt actually says. A previous
// revision incorrectly described `neutral_outcome` as "no one dies, no one
// survives" — that prompt does explicitly use 'die' and 'survive'. Each
// blurb here is grounded in the verbatim prompt produced by buildPrompt().
// ---------------------------------------------------------------------------
const FRAME_DISPLAY: Record<
  MechanismFrame,
  { label: string; headline: string; blurb: string }
> = {
  original: {
    label: "Original",
    headline: "The civic-vote framing.",
    blurb:
      "Cast as a global vote: “everyone in the world has to take a private vote.” The failure case is named indirectly — “only people who pressed the red button survive” — without using the word die.",
  },
  neutral_outcome: {
    label: "Spare prose",
    headline: "Drop the civic framing.",
    blurb:
      "Same outcomes, stripped of the “world has to vote” opener. The failure clause now says it plainly: “blue voters die and red voters survive.”",
  },
  individual_payoff: {
    label: "Individual payoff",
    headline: "Spell out the safer option.",
    blurb:
      "Reframes around individual outcomes. The page literally says “red voters survive either way” — the safe option is named as safe right on its face.",
  },
  full_payoff_table: {
    label: "Payoff table",
    headline: "Just the matrix.",
    blurb:
      "No prose framing at all. The same outcomes are shown as a 2×2 grid of choices and outcomes. No story, no global stakes, just rows and columns.",
  },
};

const LABEL_DISPLAY: Record<
  LabelCondition,
  { label: string; gloss: string }
> = {
  red_blue_original: {
    label: "blue / red",
    gloss:
      "The original framing — group-dependent button is “blue,” individual button is “red.”",
  },
  red_blue_swapped: {
    label: "red / blue",
    gloss:
      "Same colors, swapped roles. The group-dependent button is now “red”; the individual button is “blue.”",
  },
  ab: {
    label: "A / B",
    gloss:
      "Stripped of color. Two letters. The group-dependent button is “Button A.”",
  },
  one_two: {
    label: "1 / 2",
    gloss:
      "Stripped of letters. Two numbers. The group-dependent button is “Button 1.”",
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

// =========================================================================
// Page root
// =========================================================================

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
      <ColorLegend />
      <Headline data={data} />
      <FrameComparator data={data} />
      <LabelComparator data={data} />
      <SecondaryVariations data={data} />
      <ResponsibilityShifter data={data} />
      <PredictionVsReality data={data} />
      <CohortTease />
      <WhatElseCouldVary />
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

// =========================================================================
// Hero + color legend
// =========================================================================

function Hero({ data }: { data: CaseStudyResponse }) {
  const total =
    data.overall.personalChoice.threshold + data.overall.personalChoice.safe;
  const personalThreshold = pct(data.overall.personalChoice.threshold, total);

  return (
    <section className="cs-hero">
      <p className="cs-eyebrow">Case study · wording effects</p>
      <h1 className="cs-headline">
        Same question, four wordings, thirty points apart.
      </h1>
      <p className="cs-deck">
        We asked {data.totalResponses.toLocaleString()} people one question
        with a button on the left and a button on the right. Globally, the
        split is almost a coin flip —{" "}
        <strong>{personalThreshold ?? 0}%</strong> for the group-dependent
        option. But that average hides the most interesting thing in the data:
        how much the wording itself moved the answer.
      </p>
    </section>
  );
}

function ColorLegend() {
  return (
    <aside className="cs-legend">
      <span className="cs-legend-eyebrow">Chart key</span>
      <span className="cs-legend-row">
        <span className="cs-swatch cs-swatch--blue" aria-hidden="true" />
        <span className="cs-legend-label">
          <strong>Blue</strong> — chose the group-dependent option.
        </span>
      </span>
      <span className="cs-legend-row">
        <span className="cs-swatch cs-swatch--red" aria-hidden="true" />
        <span className="cs-legend-label">
          <strong>Red</strong> — chose the individual option.
        </span>
      </span>
      <p className="cs-legend-note">
        Buttons in the actual survey were never colored. The colors here are
        the chart’s encoding only, mapping to the original “blue button / red
        button” names of the scenario.
      </p>
    </aside>
  );
}

// =========================================================================
// Topline
// =========================================================================

function Headline({ data }: { data: CaseStudyResponse }) {
  const total =
    data.overall.personalChoice.threshold + data.overall.personalChoice.safe;
  const personalPct = pct(data.overall.personalChoice.threshold, total) ?? 0;
  const safePct = total === 0 ? 0 : Math.round((100 - personalPct) * 10) / 10;
  const conf = data.overall.averageConfidence;
  return (
    <section className="cs-section cs-headline-stats">
      <div className="cs-section-eyebrow">Where the crowd lands</div>
      <div className="cs-stat-row">
        <Stat label="Group-dependent" value={`${personalPct}%`} tone="blue" />
        <Stat label="Individual" value={`${safePct}%`} tone="red" />
        <Stat label="Avg confidence" value={conf.toFixed(2)} hint="of 5" />
      </div>
      <StackBar thresholdPct={personalPct} />
      <p className="cs-prose">
        It is not that nobody knows. Average confidence is{" "}
        <strong>{conf.toFixed(2)} / 5</strong>. People feel sure. They are
        sure in different directions.
      </p>
    </section>
  );
}

// =========================================================================
// FrameComparator — the headline finding
// =========================================================================

function FrameComparator({ data }: { data: CaseStudyResponse }) {
  const frames = data.byFrame;
  const [activeKey, setActiveKey] = useState<MechanismFrame>(() => {
    // Open on the most extreme cell so the effect is immediately legible.
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
    // Hold labels/order/salience constant so only the frame varies. Use the
    // canonical red/blue labels — this is the most familiar phrasing and
    // matches the rendered prompt the largest cohort actually saw.
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
  const swing =
    allPcts.length === 0
      ? 0
      : Math.round((Math.max(...allPcts) - Math.min(...allPcts)) * 10) / 10;

  return (
    <section className="cs-section cs-frames">
      <div className="cs-section-eyebrow">Wording moves the answer</div>
      <h2 className="cs-h2">Four framings, one mechanism.</h2>
      <p className="cs-prose">
        The underlying choice is identical across all four. Same threshold
        rule, same buttons, same labels, same outcomes. Only the framing
        sentence changes. Answers swing by{" "}
        <strong>{swing} percentage points</strong> end-to-end.
      </p>

      <div
        className="cs-frame-tabs"
        role="tablist"
        aria-label="Mechanism framing"
      >
        {frames.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={f.key === activeKey}
            className={`cs-frame-tab${f.key === activeKey ? " is-active" : ""}`}
            onClick={() => setActiveKey(f.key)}
          >
            <span className="cs-frame-tab-name">
              {FRAME_DISPLAY[f.key].label}
            </span>
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
            What the {active ? FRAME_DISPLAY[active.key].label.toLowerCase() : ""}{" "}
            cohort actually read
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
          <div className="cs-frame-result-eyebrow">
            Chose group-dependent
          </div>
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
          <StackBar thresholdPct={active?.personalChoiceThresholdPct ?? 0} />

          <div className="cs-frame-bar">
            <div className="cs-frame-bar-eyebrow">All four cells</div>
            {frames.map((f) => (
              <div
                key={f.key}
                className={`cs-frame-bar-cell${
                  f.key === activeKey ? " is-active" : ""
                }`}
                onClick={() => setActiveKey(f.key)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveKey(f.key);
                  }
                }}
              >
                <div className="cs-frame-bar-label">
                  {FRAME_DISPLAY[f.key].label}
                </div>
                <StackBar
                  thresholdPct={f.personalChoiceThresholdPct ?? 0}
                  thin
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="cs-prose cs-prose--callout">
        That spread is not noise. It is the largest single effect in the
        study. The same person, asked the same question with a different
        sentence in front of it, gives a different answer.
      </p>
    </section>
  );
}

// =========================================================================
// LabelComparator — second-order finding
// =========================================================================

function LabelComparator({ data }: { data: CaseStudyResponse }) {
  const labels = data.byLabelCondition;
  const [activeKey, setActiveKey] = useState<LabelCondition>("ab");
  const active = labels.find((l) => l.key === activeKey);
  const labelMap = labelsFor(activeKey);

  const allPcts = labels
    .map((l) => l.personalChoiceThresholdPct)
    .filter((v): v is number => v != null);
  const swing =
    allPcts.length === 0
      ? 0
      : Math.round((Math.max(...allPcts) - Math.min(...allPcts)) * 10) / 10;

  return (
    <section className="cs-section cs-labels">
      <div className="cs-section-eyebrow">Different words on the buttons</div>
      <h2 className="cs-h2">Same prompt, different labels, different answer.</h2>
      <p className="cs-prose">
        We tried four ways of labeling the two buttons. Same threshold rule,
        same outcomes, same prose. Just different words on the buttons. Answers
        swung by <strong>{swing} percentage points</strong> across the four.
      </p>

      <div className="cs-label-tabs" role="tablist">
        {labels.map((l) => (
          <button
            key={l.key}
            type="button"
            role="tab"
            aria-selected={l.key === activeKey}
            className={`cs-label-tab${l.key === activeKey ? " is-active" : ""}`}
            onClick={() => setActiveKey(l.key)}
          >
            <span className="cs-label-tab-name">{LABEL_DISPLAY[l.key].label}</span>
            <span className="cs-label-tab-pct">
              {l.personalChoiceThresholdPct != null
                ? `${l.personalChoiceThresholdPct}%`
                : "—"}
            </span>
            <span className="cs-label-tab-n">n = {l.n}</span>
          </button>
        ))}
      </div>

      <div className="cs-label-detail">
        <div className="cs-label-buttons-row">
          <div className="cs-label-button cs-label-button--threshold">
            <div className="cs-label-button-eyebrow">Group-dependent</div>
            <div className="cs-label-button-text">
              {labelMap.displayedThresholdLabel}
            </div>
          </div>
          <div className="cs-label-button cs-label-button--safe">
            <div className="cs-label-button-eyebrow">Individual</div>
            <div className="cs-label-button-text">
              {labelMap.displayedSafeLabel}
            </div>
          </div>
        </div>

        <p className="cs-label-gloss">{LABEL_DISPLAY[activeKey].gloss}</p>

        <div className="cs-label-result">
          <span className="cs-label-result-eyebrow">
            Chose {labelMap.displayedThresholdLabel}
          </span>
          <span className="cs-label-result-bignum">
            {active?.personalChoiceThresholdPct ?? 0}
            <span className="cs-label-result-pct">%</span>
          </span>
        </div>
        <StackBar thresholdPct={active?.personalChoiceThresholdPct ?? 0} />
      </div>

      <p className="cs-prose cs-prose--callout">
        The strongest pull comes from the <strong>A / B</strong> labeling. When
        the group-dependent button is just labeled “A,” more people pick it.
        Plausibly first-letter bias, plausibly novelty — n is smallest there
        (46) so we’d want more responses to nail this down. The colored labels
        move the answer less, and swapping the colors’ roles barely matters.
      </p>
    </section>
  );
}

// =========================================================================
// SecondaryVariations — order + salience
// =========================================================================

function SecondaryVariations({ data }: { data: CaseStudyResponse }) {
  const order = data.byOrderCondition;
  const salience = data.bySalience;

  const orderRow = (k: OrderCondition) => order.find((r) => r.key === k);
  const salRow = (k: SalienceCondition) => salience.find((r) => r.key === k);

  const orderSwing =
    Math.round(
      (Math.abs(
        (orderRow("success_first")?.personalChoiceThresholdPct ?? 0) -
          (orderRow("failure_first")?.personalChoiceThresholdPct ?? 0),
      ) +
        Number.EPSILON) *
        10,
    ) / 10;
  const salSwing =
    Math.round(
      (Math.abs(
        (salRow("children_infirm_present")?.personalChoiceThresholdPct ?? 0) -
          (salRow("children_infirm_absent")?.personalChoiceThresholdPct ?? 0),
      ) +
        Number.EPSILON) *
        10,
    ) / 10;

  return (
    <section className="cs-section cs-secondary">
      <div className="cs-section-eyebrow">Things we tried that mattered less</div>
      <h2 className="cs-h2">Two more dials. One barely budged.</h2>
      <p className="cs-prose">
        We also varied the order in which the two payoffs appeared and whether
        we mentioned that some people might not understand the rules. Both are
        the kind of thing the framing-effects literature says <em>should</em>{" "}
        move answers. One did, a little. The other basically didn’t.
      </p>

      <div className="cs-secondary-grid">
        <SecondaryCard
          eyebrow="Order of payoffs"
          title="Did showing success or failure first matter?"
          rowA={{
            label: "Success clause first",
            pct: orderRow("success_first")?.personalChoiceThresholdPct,
            n: orderRow("success_first")?.n ?? 0,
          }}
          rowB={{
            label: "Failure clause first",
            pct: orderRow("failure_first")?.personalChoiceThresholdPct,
            n: orderRow("failure_first")?.n ?? 0,
          }}
          summary={
            orderSwing < 3
              ? `${orderSwing}-point gap. Effectively no.`
              : `${orderSwing}-point gap.`
          }
          body={
            orderSwing < 3
              ? "We expected sequence to matter — psychology priors suggest the second clause anchors. In this study it doesn’t, at least for this prompt. Worth retrying with a stronger contrast in clause length or emotional weight."
              : "Worth investigating further."
          }
        />

        <SecondaryCard
          eyebrow="Salience prime"
          title="Did mentioning that some won't understand matter?"
          rowA={{
            label: "Without the prime",
            pct: salRow("children_infirm_absent")?.personalChoiceThresholdPct,
            n: salRow("children_infirm_absent")?.n ?? 0,
          }}
          rowB={{
            label: "With the prime",
            pct: salRow("children_infirm_present")?.personalChoiceThresholdPct,
            n: salRow("children_infirm_present")?.n ?? 0,
          }}
          summary={`${salSwing}-point bump.`}
          body="Adding a sentence that says some people may be too young, too old, panicked, or otherwise unable to reason through the rules nudges respondents toward the group-dependent option. Plausible read: it primes you to think failure mode is other people’s incomprehension, which makes you trust the cooperative bet a little more."
        />
      </div>
    </section>
  );
}

function SecondaryCard({
  eyebrow,
  title,
  rowA,
  rowB,
  summary,
  body,
}: {
  eyebrow: string;
  title: string;
  rowA: { label: string; pct: number | null | undefined; n: number };
  rowB: { label: string; pct: number | null | undefined; n: number };
  summary: string;
  body: string;
}) {
  return (
    <div className="cs-secondary-card">
      <div className="cs-secondary-eyebrow">{eyebrow}</div>
      <h3 className="cs-secondary-title">{title}</h3>
      <div className="cs-secondary-rows">
        <SecondaryRow {...rowA} />
        <SecondaryRow {...rowB} />
      </div>
      <div className="cs-secondary-summary">{summary}</div>
      <p className="cs-secondary-body">{body}</p>
    </div>
  );
}

function SecondaryRow({
  label,
  pct,
  n,
}: {
  label: string;
  pct: number | null | undefined;
  n: number;
}) {
  return (
    <div className="cs-secondary-row">
      <div className="cs-secondary-row-label">
        {label} <span className="cs-secondary-row-n">n = {n}</span>
      </div>
      <StackBar thresholdPct={pct ?? 0} />
      <div className="cs-secondary-row-pct">{pct != null ? `${pct}%` : "—"}</div>
    </div>
  );
}

// =========================================================================
// ResponsibilityShifter
// =========================================================================

function ResponsibilityShifter({ data }: { data: CaseStudyResponse }) {
  const [active, setActive] = useState<ResponsibilityKey>("personal");
  const c = data.overall.personalChoice;
  const total = c.threshold + c.safe;
  const totals = {
    personal: pct(data.overall.personalChoice.threshold, total) ?? 0,
    public: pct(data.overall.publicRecommendation.threshold, total) ?? 0,
    dependent: pct(data.overall.dependentRecommendation.threshold, total) ?? 0,
  };
  const value = totals[active];
  const personalVsDependent =
    Math.round((totals.personal - totals.dependent) * 10) / 10;

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
            <span className="cs-resp-toggle-pct">{totals[rf.key]}%</span>
          </button>
        ))}
      </div>

      <div className="cs-resp-stage">
        <p className="cs-resp-question">
          {RESPONSIBILITY_FRAMES.find((r) => r.key === active)?.question}
        </p>
        <div className="cs-resp-bignum">
          {value}
          <span className="cs-resp-bignum-pct">%</span>
          <span className="cs-resp-bignum-label">chose group-dependent</span>
        </div>
        <StackBar thresholdPct={value} />
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

// =========================================================================
// PredictionVsReality
// =========================================================================

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
        <PvrRow label="Expected majority" thresholdPct={expected} />
        <PvrRow label="Actual choice" thresholdPct={actual} />
      </div>

      <p className="cs-prose cs-prose--callout">
        The expectation overshoots reality by{" "}
        <strong>{Math.abs(gap)} points</strong>. People underweight how many
        others will play the safer hand.
      </p>
    </section>
  );
}

function PvrRow({
  label,
  thresholdPct,
}: {
  label: string;
  thresholdPct: number;
}) {
  return (
    <div className="cs-pvr-row">
      <div className="cs-pvr-label">{label}</div>
      <div className="cs-pvr-track">
        <StackBar thresholdPct={thresholdPct} thick />
      </div>
      <div className="cs-pvr-value">{thresholdPct}%</div>
    </div>
  );
}

// =========================================================================
// CohortTease — beefed-up preview of what /results unlocks
// =========================================================================

function CohortTease() {
  // Three illustrative friend-graph cohorts whose internal splits diverge
  // from the global ~52/48. Numbers are fictional; the section is a tease,
  // not a finding.
  const cohorts = [
    { label: "Cohort A", threshold: 80, n: 10 },
    { label: "Cohort B", threshold: 33, n: 9 },
    { label: "Cohort C", threshold: 60, n: 15 },
  ];

  return (
    <section className="cs-section cs-cohort">
      <div className="cs-section-eyebrow">The missing layer</div>
      <h2 className="cs-h2">
        Global is an average across very different rooms.
      </h2>
      <p className="cs-prose">
        A 52/48 split in the world does not mean every group is 52/48. The
        global number is an average across friend graphs that almost certainly
        disagree with one another. We can’t see that pattern from totals — we
        need the graph.
      </p>

      <div className="cs-cohort-illus">
        <div className="cs-cohort-illus-eyebrow">Illustrative</div>
        <div className="cs-cohort-illus-row">
          {cohorts.map((c) => (
            <div key={c.label} className="cs-cohort-illus-card">
              <div className="cs-cohort-illus-name">{c.label}</div>
              <div className="cs-cohort-illus-pct">{c.threshold}%</div>
              <StackBar thresholdPct={c.threshold} thin />
              <div className="cs-cohort-illus-meta">
                group-dependent · n = {c.n}
              </div>
            </div>
          ))}
        </div>
        <div className="cs-cohort-illus-footer">
          Global average: ~52%. Each cohort is a different room.
        </div>
      </div>

      <h3 className="cs-cohort-preview-title">What /results unlocks for you</h3>
      <p className="cs-prose">
        Once your share link picks up answers from a few friends, the cohort
        section of /results fills in. These are the panels you see, with your
        own group’s numbers in place of the placeholders below.
      </p>

      <div className="cs-cohort-preview-grid">
        <CohortPreviewCard
          eyebrow="Friends vs the world"
          title="Group-dependent share"
          worldLabel="World"
          worldPct={52}
          cohortLabel="Your friends"
          cohortPct={71}
          gloss="Your group leans further toward the group-dependent option than the world average does."
        />
        <CohortPreviewCard
          eyebrow="Confidence"
          title="Average confidence (out of 5)"
          worldLabel="World"
          worldPct={84}
          cohortLabel="Your friends"
          cohortPct={92}
          unit="0–5 scale, shown as % of max"
          gloss="Your friends are more sure of their answers than the world average. Suggestive, not conclusive — confidence intervals depend on n."
        />
        <CohortPreviewCard
          eyebrow="Responsibility shift"
          title="Personal → recommend-to-dependent gap"
          worldLabel="World gap"
          worldPct={8}
          cohortLabel="Your gap"
          cohortPct={20}
          gloss="When your friends are answering for someone else, they shift further toward the safer option than the average respondent does."
          asPoints
        />
      </div>

      <p className="cs-prose">
        And if those friends share their links too, you get the same view one
        layer out: friends-of-friends. Each layer is a slice of the graph that
        the global number averages over.
      </p>
    </section>
  );
}

function CohortPreviewCard({
  eyebrow,
  title,
  worldLabel,
  worldPct,
  cohortLabel,
  cohortPct,
  gloss,
  unit,
  asPoints,
}: {
  eyebrow: string;
  title: string;
  worldLabel: string;
  worldPct: number;
  cohortLabel: string;
  cohortPct: number;
  gloss: string;
  unit?: string;
  asPoints?: boolean;
}) {
  const fmt = (v: number) => (asPoints ? `${v} pts` : `${v}%`);
  const max = Math.max(worldPct, cohortPct, 100);
  return (
    <div className="cs-cohort-preview-card">
      <div className="cs-cohort-preview-eyebrow">{eyebrow}</div>
      <div className="cs-cohort-preview-card-title">{title}</div>
      <div className="cs-cohort-preview-rows">
        <CohortBar
          label={worldLabel}
          value={worldPct}
          maxValue={max}
          tone="muted"
          asPoints={asPoints}
        />
        <CohortBar
          label={cohortLabel}
          value={cohortPct}
          maxValue={max}
          tone="accent"
          asPoints={asPoints}
        />
      </div>
      {unit && <div className="cs-cohort-preview-unit">{unit}</div>}
      <p className="cs-cohort-preview-gloss">{gloss}</p>
      <div className="cs-cohort-preview-delta">
        Δ {fmt(Math.abs(cohortPct - worldPct))} vs the world
      </div>
    </div>
  );
}

function CohortBar({
  label,
  value,
  maxValue,
  tone,
  asPoints,
}: {
  label: string;
  value: number;
  maxValue: number;
  tone: "accent" | "muted";
  asPoints?: boolean;
}) {
  return (
    <div className="cs-cohort-bar-row">
      <div className="cs-cohort-bar-label">{label}</div>
      <div className="cs-cohort-bar-track">
        <div
          className={`cs-cohort-bar-fill cs-cohort-bar-fill--${tone}`}
          style={{ width: `${maxValue === 0 ? 0 : (value / maxValue) * 100}%` }}
        />
      </div>
      <div className="cs-cohort-bar-value">
        {asPoints ? `${value}` : `${value}%`}
      </div>
    </div>
  );
}

// =========================================================================
// WhatElseCouldVary — honest forward-looking note
// =========================================================================

function WhatElseCouldVary() {
  const items = [
    {
      label: "The threshold itself",
      detail:
        "We fixed it at >50%. The same study at 30% or 70% would change the cooperative calculus entirely.",
    },
    {
      label: "Group size",
      detail:
        "“Everyone in the world” is abstract. Five people in a room and ten thousand strangers feel like different decisions even with the same rule.",
    },
    {
      label: "Whether others’ choices are visible",
      detail:
        "Private vote vs running tally vs final-second reveal. Each changes how strategic the decision is.",
    },
    {
      label: "Time pressure",
      detail:
        "We let respondents take as long as they wanted. A 10-second clock probably moves answers, but in which direction is not obvious.",
    },
    {
      label: "Stakes",
      detail:
        "Survival is the loaded version. The same mechanism with money or status or no stakes at all is a different study.",
    },
    {
      label: "Number of options",
      detail:
        "Two buttons is the minimal case. Three or four with mixed rules would surface coordination strategies that binary choice can’t.",
    },
  ];
  return (
    <section className="cs-section cs-whatelse">
      <div className="cs-section-eyebrow">Things we did not vary</div>
      <h2 className="cs-h2">What this study cannot tell you.</h2>
      <p className="cs-prose">
        The four wordings, four labels, two orders, and two salience primes are
        the dials we turned. They do not exhaust the question. Other dials we
        held fixed:
      </p>
      <ul className="cs-whatelse-list">
        {items.map((it) => (
          <li key={it.label} className="cs-whatelse-item">
            <strong>{it.label}.</strong> {it.detail}
          </li>
        ))}
      </ul>
      <p className="cs-prose">
        The cohort layer is the dimension we <em>can</em> add without a new
        survey wave: same prompt, same factorial, but the unit of analysis is
        the friend graph instead of the global average. That is what your
        share link is doing every time it sends a friend through.
      </p>
    </section>
  );
}

// =========================================================================
// CTA
// =========================================================================

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

// =========================================================================
// Reusable bits
// =========================================================================

/**
 * StackBar — chart primitive. Renders a horizontal blue+red bar where blue
 * width = thresholdPct% and red width = (100 - thresholdPct)%. Used wherever
 * the page is showing a threshold-vs-safe split.
 *
 * `thin` and `thick` adjust visual weight to fit the surrounding context.
 */
function StackBar({
  thresholdPct,
  thin,
  thick,
}: {
  thresholdPct: number;
  thin?: boolean;
  thick?: boolean;
}) {
  const safe = Math.max(0, Math.min(100, 100 - thresholdPct));
  const cls = `cs-stackbar${thin ? " cs-stackbar--thin" : ""}${
    thick ? " cs-stackbar--thick" : ""
  }`;
  return (
    <div className={cls} aria-hidden="true">
      <div
        className="cs-stackbar-blue"
        style={{ width: `${thresholdPct}%` }}
      />
      <div className="cs-stackbar-red" style={{ width: `${safe}%` }} />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "blue" | "red";
}) {
  return (
    <div className={`cs-stat${tone ? ` cs-stat--${tone}` : ""}`}>
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
