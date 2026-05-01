import { useEffect, useState } from "react";
import {
  CaseStudyShell,
  ColorLegend,
  CohortTease,
  CtaBlock,
  FrameComparator,
  GatePage,
  LabelComparator,
  PredictionVsReality,
  ResponsibilityShifter,
  SecondaryVariations,
  StackBar,
  VariantChooser,
  pct,
  useCaseStudyData,
} from "./CaseStudy";
import type { CaseStudyResponse } from "@shared/types";

/**
 * /case-study/steps — Stepper variant.
 *
 * Tone: scientific-wry. Short. Dry. Precise. Each step is a single
 * finding with a one-line setup and one-line takeaway. The reader
 * advances explicitly. Good for someone who wants to see the result
 * before deciding whether to read the prose around it.
 *
 * Reuses the heavy chart components from /case-study; only the shell
 * and the framing prose change.
 */

type Step = {
  key: string;
  eyebrow: string;
  title: string;
  intro: (data: CaseStudyResponse) => React.ReactNode;
  body: (data: CaseStudyResponse) => React.ReactNode;
  takeaway: (data: CaseStudyResponse) => React.ReactNode;
};

const STEPS: Step[] = [
  {
    key: "setup",
    eyebrow: "Step 1 · setup",
    title: "Two buttons. One choice.",
    intro: (d) => (
      <>
        We asked <strong>{d.totalResponses.toLocaleString()}</strong>{" "}
        respondents one question. Group-dependent button on one side, individual
        button on the other. We varied the wording. Same underlying choice in
        every cell.
      </>
    ),
    body: () => (
      <div className="cs-step-meta">
        <ul className="cs-step-meta-list">
          <li>
            <strong>4</strong> mechanism framings
          </li>
          <li>
            <strong>4</strong> button labelings
          </li>
          <li>
            <strong>2</strong> payoff orderings
          </li>
          <li>
            <strong>2</strong> salience primes
          </li>
        </ul>
        <ColorLegend />
      </div>
    ),
    takeaway: () => <>Sixteen factorial cells. One question per respondent.</>,
  },
  {
    key: "topline",
    eyebrow: "Step 2 · the topline",
    title: "The crowd is roughly a coin flip.",
    intro: (d) => {
      const total =
        d.overall.personalChoice.threshold + d.overall.personalChoice.safe;
      const p = pct(d.overall.personalChoice.threshold, total) ?? 0;
      return (
        <>
          <strong>{p}%</strong> chose the group-dependent option. Average
          confidence: <strong>{d.overall.averageConfidence.toFixed(2)} / 5</strong>.
        </>
      );
    },
    body: (d) => {
      const total =
        d.overall.personalChoice.threshold + d.overall.personalChoice.safe;
      const p = pct(d.overall.personalChoice.threshold, total) ?? 0;
      return (
        <div className="cs-step-bignum">
          <span className="cs-step-bignum-value">{p}%</span>
          <span className="cs-step-bignum-label">group-dependent</span>
          <StackBar thresholdPct={p} thick />
        </div>
      );
    },
    takeaway: () =>
      <>It is not that nobody knows. People feel sure — in different directions.</>,
  },
  {
    key: "frame",
    eyebrow: "Step 3 · biggest finding",
    title: "Wording moves the answer ~30 points.",
    intro: () =>
      <>
        Same threshold rule. Same labels. Same outcomes. Only the framing
        sentence changes.
      </>,
    body: (d) => <FrameComparator data={d} />,
    takeaway: () =>
      <>The largest single effect in the study is which sentence sat above the buttons.</>,
  },
  {
    key: "labels",
    eyebrow: "Step 4 · second-order",
    title: "Words on the buttons matter, too.",
    intro: () =>
      <>Same prompt, four labelings. The split moves about 14 points.</>,
    body: (d) => <LabelComparator data={d} />,
    takeaway: () =>
      <>“A / B” pulls hardest. Plausibly first-letter bias; n there is small.</>,
  },
  {
    key: "secondary",
    eyebrow: "Step 5 · the dials that didn't",
    title: "Two priors the data pushed back on.",
    intro: () =>
      <>
        We expected order-of-payoffs to anchor and salience-of-incomprehension
        to nudge. One basically didn't. The other nudged a little.
      </>,
    body: (d) => <SecondaryVariations data={d} />,
    takeaway: () =>
      <>Negative results count. Two known framing-effect levers, two non-results here.</>,
  },
  {
    key: "responsibility",
    eyebrow: "Step 6 · same person, three asks",
    title: "Who you answer for changes your answer.",
    intro: () =>
      <>Personal. Public recommendation. For someone in your care.</>,
    body: (d) => <ResponsibilityShifter data={d} />,
    takeaway: () =>
      <>The same respondent gets more cautious when somebody else's outcome rides on it.</>,
  },
  {
    key: "prediction",
    eyebrow: "Step 7 · the meta-question",
    title: "The crowd misreads itself.",
    intro: () =>
      <>We also asked what they thought everyone <em>else</em> would do.</>,
    body: (d) => <PredictionVsReality data={d} />,
    takeaway: () =>
      <>The expected lean overshoots reality by several points. Predicted cooperation &gt; observed cooperation.</>,
  },
  {
    key: "cohort",
    eyebrow: "Step 8 · the missing layer",
    title: "The crowd is an average. Your friends are a sample.",
    intro: () =>
      <>
        Everything above is the global view. It does not tell you what your
        people would do.
      </>,
    body: (d) => <CohortTease shareCode={d.viewerShareCode} />,
    takeaway: () =>
      <>A 52/48 world contains 80/20 friend graphs. Send the link, find your room.</>,
  },
];

export function CaseStudySteps() {
  const load = useCaseStudyData();
  const [idx, setIdx] = useState(0);

  // Sync step index with URL hash so reload + back-button keep position.
  useEffect(() => {
    const h = window.location.hash.replace(/^#/, "");
    const found = STEPS.findIndex((s) => s.key === h);
    if (found >= 0) setIdx(found);
  }, []);
  useEffect(() => {
    const target = STEPS[idx];
    if (!target) return;
    if (window.location.hash !== `#${target.key}`) {
      window.history.replaceState(null, "", `#${target.key}`);
    }
    // Scroll the new step into view at the top of the viewport.
    document.querySelector(".cs-step-stage")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [idx]);

  if (load.kind === "loading") {
    return (
      <CaseStudyShell>
        <VariantChooser current="steps" />
        <p className="cs-loading">Loading the latest numbers…</p>
      </CaseStudyShell>
    );
  }
  if (load.kind === "error") {
    return (
      <CaseStudyShell>
        <VariantChooser current="steps" />
        <p className="cs-error">Could not load case-study data: {load.message}</p>
      </CaseStudyShell>
    );
  }
  if (load.kind === "gated") return <GatePage />;

  const data = load.data;
  const step = STEPS[idx]!;
  const isLast = idx === STEPS.length - 1;
  const isFirst = idx === 0;

  return (
    <CaseStudyShell asOf={data.dataAsOf} totalResponses={data.totalResponses}>
      <VariantChooser current="steps" />

      <div className="cs-step-progress" aria-label={`Step ${idx + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className={`cs-step-tick${i === idx ? " is-current" : ""}${i < idx ? " is-done" : ""}`}
            onClick={() => setIdx(i)}
            aria-current={i === idx ? "step" : undefined}
            aria-label={`Step ${i + 1}: ${s.title}`}
          >
            <span className="cs-step-tick-num">{i + 1}</span>
          </button>
        ))}
      </div>

      <section className="cs-step-stage" aria-live="polite">
        <div className="cs-step-eyebrow">{step.eyebrow}</div>
        <h1 className="cs-step-title">{step.title}</h1>
        <p className="cs-step-intro">{step.intro(data)}</p>
        <div className="cs-step-body">{step.body(data)}</div>
        <p className="cs-step-takeaway">
          <span className="cs-step-takeaway-marker">↳</span> {step.takeaway(data)}
        </p>
      </section>

      <nav className="cs-step-nav" aria-label="Step navigation">
        <button
          type="button"
          className="cs-step-nav-btn"
          onClick={() => setIdx((n) => Math.max(0, n - 1))}
          disabled={isFirst}
        >
          ← Previous
        </button>
        <span className="cs-step-nav-counter">
          {idx + 1} / {STEPS.length}
        </span>
        {isLast ? (
          <a className="cs-step-nav-btn cs-step-nav-btn--primary" href="/results">
            Open results →
          </a>
        ) : (
          <button
            type="button"
            className="cs-step-nav-btn cs-step-nav-btn--primary"
            onClick={() => setIdx((n) => Math.min(STEPS.length - 1, n + 1))}
          >
            Next →
          </button>
        )}
      </nav>

      {isLast && <CtaBlock shareCode={data.viewerShareCode} />}
    </CaseStudyShell>
  );
}
