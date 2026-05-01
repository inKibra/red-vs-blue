import { useEffect, useMemo, useState } from "react";
import { getCaseStudyData } from "./api";
import { buildPrompt, labelsFor } from "@shared/conditions";
import {
  BigNumberCard,
  BucketRow,
  ConstellationCard,
  DepthBar,
  DriftCard,
  RadarCard,
} from "./Results";
import { buildSampleCohort } from "./sampleCohort";
import { SharePanel } from "./SharePanel";
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

export type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; data: CaseStudyResponse }
  | { kind: "gated" }
  | { kind: "error"; message: string };

/**
 * Shared loader for every /case-study variant. The data shape and gating
 * behavior is identical across structural variants — only the rendering
 * shell changes.
 */
export function useCaseStudyData(): LoadState {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  useEffect(() => {
    let cancelled = false;
    getCaseStudyData()
      .then((res) => {
        if (cancelled) return;
        if (res.status === "gated") setLoad({ kind: "gated" });
        else setLoad({ kind: "ok", data: res.data });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoad({ kind: "error", message: (e as Error).message ?? "Failed to load." });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return load;
}

export type VariantKey = "linear" | "steps" | "sticky";

const VARIANTS: { key: VariantKey; href: string; label: string; gloss: string }[] = [
  { key: "linear", href: "/case-study",        label: "Long form",        gloss: "scroll the whole story" },
  { key: "steps",  href: "/case-study/steps",  label: "One step at a time", gloss: "finding by finding" },
  { key: "sticky", href: "/case-study/sticky", label: "Sticky narrative",  gloss: "viz pinned, prose moves" },
];

/**
 * Variant chooser bar — sits at the very top of every case-study variant
 * so a reader can A/B their preferred reading shape. Renders as a small
 * pill row; the current variant is non-interactive.
 */
export function VariantChooser({ current }: { current: VariantKey }) {
  return (
    <nav className="cs-variant-chooser" aria-label="Case study format">
      <span className="cs-variant-chooser-eyebrow">Reading format</span>
      <div className="cs-variant-chooser-row">
        {VARIANTS.map((v) =>
          v.key === current ? (
            <span key={v.key} className="cs-variant-pill is-current" aria-current="page">
              <span className="cs-variant-pill-label">{v.label}</span>
              <span className="cs-variant-pill-gloss">{v.gloss}</span>
            </span>
          ) : (
            <a key={v.key} href={v.href} className="cs-variant-pill">
              <span className="cs-variant-pill-label">{v.label}</span>
              <span className="cs-variant-pill-gloss">{v.gloss}</span>
            </a>
          ),
        )}
      </div>
    </nav>
  );
}

export function CaseStudy() {
  const load = useCaseStudyData();

  if (load.kind === "loading") {
    return (
      <CaseStudyShell>
        <VariantChooser current="linear" />
        <p className="cs-loading">Loading the latest numbers…</p>
      </CaseStudyShell>
    );
  }
  if (load.kind === "error") {
    return (
      <CaseStudyShell>
        <VariantChooser current="linear" />
        <p className="cs-error">Could not load case-study data: {load.message}</p>
      </CaseStudyShell>
    );
  }
  if (load.kind === "gated") {
    return <GatePage />;
  }

  const data = load.data;
  return (
    <CaseStudyShell asOf={data.dataAsOf} totalResponses={data.totalResponses}>
      <VariantChooser current="linear" />
      <Hero data={data} />
      <ColorLegend />
      <Headline data={data} />
      <FrameComparator data={data} />
      <LabelComparator data={data} />
      <SecondaryVariations data={data} />
      <ResponsibilityShifter data={data} />
      <PredictionVsReality data={data} />
      <CohortTease shareCode={data.viewerShareCode} />
      <CtaBlock shareCode={data.viewerShareCode} />
    </CaseStudyShell>
  );
}

export function CaseStudyShell({
  children,
  asOf,
  totalResponses,
}: {
  children: React.ReactNode;
  asOf?: string;
  totalResponses?: number;
}) { return (
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
); }

// =========================================================================
// Hero + color legend
// =========================================================================

export function Hero({ data }: { data: CaseStudyResponse }) { const total =
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
); }

export function ColorLegend() { return (
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
); }

// =========================================================================
// Topline
// =========================================================================

export function Headline({ data }: { data: CaseStudyResponse }) { const total =
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
); }

// =========================================================================
// FrameComparator — the headline finding
// =========================================================================

export function FrameComparator({ data }: { data: CaseStudyResponse }) { const frames = data.byFrame;
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
          id={`cs-frame-tab-${f.key}`}
          type="button"
          role="tab"
          aria-selected={f.key === activeKey}
          aria-controls={`cs-frame-panel-${f.key}`}
          tabIndex={f.key === activeKey ? 0 : -1}
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

    <div
      className="cs-frame-detail"
      role="tabpanel"
      id={active ? `cs-frame-panel-${active.key}` : undefined}
      aria-labelledby={active ? `cs-frame-tab-${active.key}` : undefined}
      tabIndex={0}
    >
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
); }

// =========================================================================
// LabelComparator — second-order finding
// =========================================================================

export function LabelComparator({ data }: { data: CaseStudyResponse }) { const labels = data.byLabelCondition;
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

    <div className="cs-label-tabs" role="tablist" aria-label="Button label">
      {labels.map((l) => (
        <button
          key={l.key}
          id={`cs-label-tab-${l.key}`}
          type="button"
          role="tab"
          aria-selected={l.key === activeKey}
          aria-controls={`cs-label-panel-${l.key}`}
          tabIndex={l.key === activeKey ? 0 : -1}
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

    <div
      className="cs-label-detail"
      role="tabpanel"
      id={active ? `cs-label-panel-${active.key}` : undefined}
      aria-labelledby={active ? `cs-label-tab-${active.key}` : undefined}
      tabIndex={0}
    >
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
); }

// =========================================================================
// SecondaryVariations — order + salience
// =========================================================================

export function SecondaryVariations({ data }: { data: CaseStudyResponse }) { const order = data.byOrderCondition;
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
); }

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

export function ResponsibilityShifter({ data }: { data: CaseStudyResponse }) { const [active, setActive] = useState<ResponsibilityKey>("personal");
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
      Who you answer for changes your answer.
    </h2>
    <p className="cs-prose">
      Every respondent answered the same scenario from three angles: what
      they themselves would do, what they would recommend publicly, and what
      they would tell a child or someone in their care to do. Same person,
      three different framings of who the answer is for.
    </p>

    <div className="cs-resp-toggle" role="tablist" aria-label="Who you answer for">
      {RESPONSIBILITY_FRAMES.map((rf) => (
        <button
          key={rf.key}
          id={`cs-resp-tab-${rf.key}`}
          type="button"
          role="tab"
          aria-selected={rf.key === active}
          aria-controls="cs-resp-stage"
          tabIndex={rf.key === active ? 0 : -1}
          className={`cs-resp-toggle-btn${rf.key === active ? " is-active" : ""}`}
          onClick={() => setActive(rf.key)}
        >
          <span className="cs-resp-toggle-eyebrow">{rf.eyebrow}</span>
          <span className="cs-resp-toggle-pct">{totals[rf.key]}%</span>
        </button>
      ))}
    </div>

    <div
      className="cs-resp-stage"
      role="tabpanel"
      id="cs-resp-stage"
      aria-labelledby={`cs-resp-tab-${active}`}
      tabIndex={0}
    >
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
); }

// =========================================================================
// PredictionVsReality
// =========================================================================

export function PredictionVsReality({ data }: { data: CaseStudyResponse }) { const total =
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
); }

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

export function CohortTease({ shareCode }: { shareCode: string | null }) {
  const mock = useMemo(buildSampleCohort, []);
  const { tree, buckets, world, nodes, kAnonThreshold } = mock;
  const viewerChoice = nodes.find((n) => n.depth === 0)?.personalChoice ?? null;

  return (
    <section className="cs-section cs-cohort">
      <div className="cs-section-eyebrow">The missing layer</div>
      <h2 className="cs-h2">The crowd is an average. Your friends are a sample.</h2>

      <p className="cs-prose">
        Everything above is the global view: hundreds of strangers averaged into
        a single number. It tells you what <em>the crowd</em> did. It does not
        tell you what your <strong>friends</strong> would do.
      </p>
      <p className="cs-prose cs-prose--callout">
        A 52/48 world contains 80/20 friend graphs and 20/80 ones. Probably
        both. Probably more variety than that. The topline can’t see geometry.
      </p>

      <h3 className="cs-cohort-preview-title">What your /results page unlocks</h3>
      <p className="cs-prose">
        Once your share link picks up answers from a few friends, the cohort
        section of /results fills in. Below is a walkthrough of what it shows,
        beat by beat, with placeholder numbers from a sample cohort of
        <strong> {tree.total} respondents </strong>
        ({tree.direct} direct, {tree.secondary} second-degree, {tree.deeper} deeper).
      </p>

      <div className="cs-cohort-walk">
        <CohortBeat
          n={1}
          eyebrow="Where they came from"
          title="Three rings, drawn from your link."
          prose={
            <>
              Every respondent is one of three things relative to you.
              <strong> Direct</strong> answered through your link.
              <strong> Second-degree</strong> answered through someone you
              recruited. <strong>Deeper</strong> is everyone past that—
              friends-of-friends-of-friends. The bar shows how the chain spread.
            </>
          }
        >
          <DepthBar tree={tree} />
        </CohortBeat>

        <CohortBeat
          n={2}
          eyebrow="The headline"
          title="Your room vs the world, in one number."
          prose={
            <>
              The single most important number on the cohort page: what fraction
              of <em>your</em> people pressed the group-dependent button, and how
              that compares to the global average. The strip underneath shows
              the same split as a bar.
            </>
          }
        >
          <BigNumberCard bucket={buckets.total} world={world} />
        </CohortBeat>

        <CohortBeat
          n={3}
          eyebrow="How it travels"
          title="Does the answer drift as the chain widens?"
          prose={
            <>
              The line moves from <em>you</em>, to your direct invites, to
              friends-of-friends, to the deeper tier. A flat line means the
              signal travels cleanly. A slope means the message mutates as it
              moves further from you. Locked rings (too few people for
              k-anonymity) are skipped, not interpolated.
            </>
          }
        >
          <DriftCard
            buckets={buckets}
            world={world}
            viewerChoice={viewerChoice}
          />
        </CohortBeat>

        <CohortBeat
          n={4}
          eyebrow="All four questions at once"
          title="Where your room’s shape pinches and stretches."
          prose={
            <>
              We asked four versions of the question: personal, public
              recommendation, for-someone-in-your-care, and prediction. Each
              axis on the radar is one of those questions. The cohort’s polygon
              is laid over the world’s—where it pinches in or stretches out is
              exactly where your room is most distinct.
            </>
          }
        >
          <RadarCard bucket={buckets.total} world={world} />
        </CohortBeat>

        <CohortBeat
          n={5}
          eyebrow="The graph you spawned"
          title="Each dot is a respondent. Each edge is a referral."
          prose={
            <>
              This is the literal share tree your link produced—not a metaphor.
              Distance from the center is invitation depth. Color is which
              button they pressed. You are the dot in the middle.
            </>
          }
        >
          <ConstellationCard nodes={nodes} />
        </CohortBeat>

        <CohortBeat
          n={6}
          eyebrow="Question by question"
          title="All four answers, your cohort against the world."
          prose={
            <>
              The four-question profile in plain horizontal bars. Each row is
              one question; the cohort’s split sits above the world’s. The gap
              between the two is where your room disagrees with the average.
            </>
          }
        >
          <BucketRow
            label="Your whole cohort"
            sublabel={`${buckets.total.count} people`}
            bucket={buckets.total}
            world={world}
            kAnon={kAnonThreshold}
          />
        </CohortBeat>

        <CohortBeat
          n={7}
          eyebrow="And by distance"
          title="The same four questions, broken out by tier."
          prose={
            <>
              Same chart, three slices: people you invited directly, the layer
              they invited, and everyone past that. If the three rows agree,
              the message is stable as it spreads. If they disagree, you’re
              watching it deform in flight.
            </>
          }
        >
          <BucketRow
            label="Direct"
            sublabel="clicked your link"
            bucket={buckets.direct}
            world={world}
            kAnon={kAnonThreshold}
            compact
          />
          <BucketRow
            label="Second-degree"
            sublabel="invited by someone you recruited"
            bucket={buckets.secondary}
            world={world}
            kAnon={kAnonThreshold}
            compact
          />
          <BucketRow
            label="Deeper"
            sublabel="three or more steps away"
            bucket={buckets.deeper}
            world={world}
            kAnon={kAnonThreshold}
            compact
          />
        </CohortBeat>
      </div>

      <p className="cs-prose">
        The world said 52%. Your room might say something else entirely. The
        only way to find out is to ask three of them.
      </p>

      <div className="cs-cohort-share">
        <div className="cs-cohort-share-eyebrow">Send your link to three</div>
        <p className="cs-cohort-share-body">
          Three is the threshold. Once three friends answer through your link,
          the cohort section of /results unlocks with their actual numbers in
          place of these placeholders. Send the link, not this page—the case
          study has spoilers; the survey link keeps the question clean.
        </p>
        <SharePanel
          shareCode={shareCode}
          tweetText="Two buttons. One choice. An anonymous coordination experiment — what would you press?"
        />
      </div>
    </section>
  );
}

/**
 * CohortBeat — one numbered card in the case-study cohort walkthrough.
 * Each beat: number badge + eyebrow + headline + 1–2 sentences of prose,
 * then the viz. The number badge is decorative; the eyebrow carries the
 * actual scan-able label.
 */
function CohortBeat({
  n,
  eyebrow,
  title,
  prose,
  children,
}: {
  n: number;
  eyebrow: string;
  title: string;
  prose: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="cs-cohort-beat">
      <div className="cs-cohort-beat-num" aria-hidden="true">{n}</div>
      <div className="cs-cohort-beat-head">
        <div className="cs-cohort-beat-eyebrow">{eyebrow}</div>
        <h3 className="cs-cohort-beat-h3">{title}</h3>
      </div>
      <p className="cs-cohort-beat-prose">{prose}</p>
      <div className="cs-cohort-beat-viz">{children}</div>
    </article>
  );
}

// =========================================================================
// CTA
// =========================================================================

// =========================================================================
// GatePage — shown when the requester has not yet responded to the survey.
//
// The case study reveals the experimental design (the four mechanism
// frames, the by-condition breakdown, the responsibility split). A reader
// who sees that before answering is no longer naive, and any subsequent
// response from them lives in a different cohort. Rather than corrupt
// the data, we ask them to take the survey first.
//
// Mirroring an admin path through here? Take the survey too — the gate
// is not authorization, it is methodological. Magic-link recovery is the
// fallback for already-responded users on a fresh device.
// =========================================================================
export function GatePage() { return (
  <div className="cs-shell">
    <header className="cs-mast">
      <a href="/" className="cs-back">
        ← The Threshold Study
      </a>
      <span className="cs-meta">Case study · gated</span>
    </header>
    <article className="cs-article cs-gate">
      <p className="cs-eyebrow">Case study · take the survey first</p>
      <h1 className="cs-headline">First, answer the question.</h1>
      <p className="cs-deck">
        This page reveals exactly how the survey was framed and how the
        wording moves the answer. Reading it before responding would prime
        your answer in a way we can no longer correct for. So we ask you to
        take the survey first — then come back and the analysis is yours.
      </p>
      <div className="cs-cta-grid cs-gate-actions">
        <a className="cs-cta-card cs-cta-card--primary" href="/">
          <div className="cs-cta-card-eyebrow">Sixty seconds</div>
          <div className="cs-cta-card-headline">Take the survey →</div>
          <div className="cs-cta-card-body">
            One question. Then this page unlocks for you.
          </div>
        </a>
        <a className="cs-cta-card" href="/results">
          <div className="cs-cta-card-eyebrow">Already responded?</div>
          <div className="cs-cta-card-headline">
            Get a magic link →
          </div>
          <div className="cs-cta-card-body">
            Different device? Open /results and request a new email link.
            Clicking it restores your session and unlocks this page.
          </div>
        </a>
      </div>
    </article>
  </div>
); }

// Bottom-of-page action block. The case study is gated to respondents, so
// every reader has already taken the survey — the way forward is to grow
// their cohort or to open their results, not to take the survey again.
export function CtaBlock({ shareCode }: { shareCode: string | null }) { return (
  <section className="cs-section cs-cta">
    <div className="cs-section-eyebrow">Two ways forward</div>
    <h2 className="cs-h2">Form your cohort. Or see where you already stand.</h2>

    <div className="cs-cta-share">
      <div className="cs-cta-share-eyebrow">Send your link to three</div>
      <p className="cs-cta-share-body">
        Three is the threshold. Once three friends answer through your
        link, the cohort section of /results unlocks for you. Send the
        link, not this page — the case study has spoilers; the survey link
        keeps the question clean.
      </p>
      <SharePanel
        shareCode={shareCode}
        tweetText="Two buttons. One choice. An anonymous coordination experiment — what would you press?"
      />
    </div>

    <a className="cs-cta-secondary" href="/results">
      Already shared? Open your results →
    </a>
  </section>
); }

// =========================================================================
// Reusable bits
// =========================================================================

/**
 * StackBar — chart primitive. Renders a horizontal blue+red bar where blue
 * width = thresholdPct% and red width = (100 - thresholdPct)%. Used wherever
 * the page is showing a threshold-vs-safe split.
 *
 * Accessibility:
 *  - role="img" + aria-label so screen readers announce the split rather
 *    than reading the visual nodes individually.
 *  - When a fill is wide enough (≥ 14% of bar) the percent text is shown
 *    inside the colored region itself; matches /results' ChoiceBar pattern
 *    so a sighted user can read the number directly off the bar.
 *
 * `thin` (8px) and `thick` (28px) adjust visual weight; thin omits inline
 * text because the bar is too short to fit a legible label.
 */
export function StackBar({
  thresholdPct,
  thin,
  thick,
}: {
  thresholdPct: number;
  thin?: boolean;
  thick?: boolean;
}) { const safe = Math.max(0, Math.min(100, 100 - thresholdPct));
const cls = `cs-stackbar${thin ? " cs-stackbar--thin" : ""}${
  thick ? " cs-stackbar--thick" : ""
}`;
// Inline labels appear only on the default/thick variants AND only when
// the segment is wide enough not to clip ugly. Mirrors /results.
const showInline = !thin;
const blueLabel = showInline && thresholdPct >= 14 ? `${Math.round(thresholdPct)}%` : "";
const redLabel = showInline && safe >= 14 ? `${Math.round(safe)}%` : "";
const ariaLabel =
  `${thresholdPct}% chose group-dependent, ${Math.round(safe * 10) / 10}% chose individual`;
return (
  <div className={cls} role="img" aria-label={ariaLabel}>
    <div
      className="cs-stackbar-blue"
      style={{ width: `${thresholdPct}%` }}
    >
      {blueLabel}
    </div>
    <div className="cs-stackbar-red" style={{ width: `${safe}%` }}>
      {redLabel}
    </div>
  </div>
); }

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

export function pct(numer: number, denom: number): number | null { if (denom === 0) return null;
return Math.round((numer / denom) * 1000) / 10; }
