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
  VariantChooser,
  pct,
  useCaseStudyData,
} from "./CaseStudy";

/**
 * /case-study/sticky — Sticky-viz variant.
 *
 * Tone: cosmic-thoughtful. Zoomed-out, second-person, observational.
 * Layout: paired sections where the prose column scrolls past a chart
 * column that sticks for the duration of the section. Each finding gets
 * its own sticky pair. On narrow viewports it falls back to a stacked
 * single-column layout (the sticky stops sticking under 900px).
 */

export function CaseStudySticky() {
  const load = useCaseStudyData();

  if (load.kind === "loading") {
    return (
      <CaseStudyShell>
        <VariantChooser current="sticky" />
        <p className="cs-loading">Loading the latest numbers…</p>
      </CaseStudyShell>
    );
  }
  if (load.kind === "error") {
    return (
      <CaseStudyShell>
        <VariantChooser current="sticky" />
        <p className="cs-error">Could not load case-study data: {load.message}</p>
      </CaseStudyShell>
    );
  }
  if (load.kind === "gated") return <GatePage />;

  const data = load.data;
  const total =
    data.overall.personalChoice.threshold + data.overall.personalChoice.safe;
  const personalPct = pct(data.overall.personalChoice.threshold, total) ?? 0;
  const dependentPct =
    pct(data.overall.dependentRecommendation.threshold, total) ?? 0;
  const personalVsDependent =
    Math.round((personalPct - dependentPct) * 10) / 10;

  return (
    <CaseStudyShell asOf={data.dataAsOf} totalResponses={data.totalResponses}>
      <VariantChooser current="sticky" />

      {/* Hero — full-width, single column. */}
      <section className="cs-sticky-hero">
        <p className="cs-eyebrow">Case study · what the wording does</p>
        <h1 className="cs-headline cs-headline--cosmic">
          A coin flip among strangers.
        </h1>
        <p className="cs-deck">
          {data.totalResponses.toLocaleString()} people answered the same
          question. Globally the split is almost even — about{" "}
          <strong>{personalPct}%</strong> for the group-dependent option.
          Underneath that average is something stranger: the same question, in
          slightly different words, gets answers thirty points apart. Scroll
          and watch the chart on the right hold its place while the prose
          underneath it accumulates.
        </p>
        <ColorLegend />
      </section>

      {/* Beat 1 — frame */}
      <StickyPair
        viz={<FrameComparator data={data} />}
        text={
          <>
            <div className="cs-sticky-eyebrow">Beat 1 · the sentence</div>
            <h2 className="cs-sticky-h2">
              Change the sentence above the buttons. Change the answer.
            </h2>
            <p className="cs-prose">
              Same threshold rule. Same labels. Same outcomes. Only the framing
              sentence above the buttons changes. The answer moves about thirty
              points end to end.
            </p>
            <p className="cs-prose">
              That is the largest single effect in the data. Larger than which
              question we ask. Larger than who we ask the question for. Larger
              than any individual demographic split we have looked at. The
              wording is the experiment.
            </p>
            <p className="cs-prose cs-prose--callout">
              You walked into the room. The room had a sentence in it. The
              sentence shaped your answer.
            </p>
          </>
        }
      />

      {/* Beat 2 — labels */}
      <StickyPair
        viz={<LabelComparator data={data} />}
        text={
          <>
            <div className="cs-sticky-eyebrow">Beat 2 · the buttons</div>
            <h2 className="cs-sticky-h2">
              Two letters do work the buttons themselves do not know about.
            </h2>
            <p className="cs-prose">
              We labeled the same two buttons four ways. Blue/red. Red/blue. A/B.
              1/2. The split moves about fourteen points across the four —
              smaller than the sentence-level effect, larger than most things
              you'd expect to be larger than it.
            </p>
            <p className="cs-prose">
              The strongest pull came from <strong>A / B</strong>. Plausibly first
              letter. Plausibly novelty. Plausibly the way a single character
              rounds the choice down to <em>obvious</em>.
            </p>
          </>
        }
      />

      {/* Beat 3 — responsibility */}
      <StickyPair
        viz={<ResponsibilityShifter data={data} />}
        text={
          <>
            <div className="cs-sticky-eyebrow">Beat 3 · who you answer for</div>
            <h2 className="cs-sticky-h2">
              The same person decides differently when somebody else needs a
              button pressed.
            </h2>
            <p className="cs-prose">
              Every respondent answered the question three ways: as themselves,
              as a public recommendation, and as advice to a child or someone
              in their care.
            </p>
            <p className="cs-prose">
              Personal: <strong>{personalPct}%</strong> for the group-dependent
              option. For someone in your care: <strong>{dependentPct}%</strong>.
              The same person, the same scenario, gets{" "}
              <strong>{Math.abs(personalVsDependent)} points</strong> more
              cautious when the outcome lands on someone else.
            </p>
            <p className="cs-prose cs-prose--callout">
              Care narrows the variance. The risk you take for yourself is not
              the risk you'd ask a child to take.
            </p>
          </>
        }
      />

      {/* Beat 4 — prediction */}
      <StickyPair
        viz={<PredictionVsReality data={data} />}
        text={
          <>
            <div className="cs-sticky-eyebrow">Beat 4 · the crowd misreads itself</div>
            <h2 className="cs-sticky-h2">The crowd is wrong about the crowd.</h2>
            <p className="cs-prose">
              We also asked respondents what they thought everyone <em>else</em>{" "}
              would choose. The expected lean toward cooperation overshoots the
              actual lean by several points.
            </p>
            <p className="cs-prose">
              Read closely: people predict more cooperation than they observe,
              while themselves contributing the level of cooperation that
              produces the observed result. Everyone thinks they're the cautious
              one in a brave room.
            </p>
          </>
        }
      />

      {/* Cohort tease — full-width because CohortTease has its own internal layout. */}
      <section className="cs-sticky-cohort-wrap">
        <div className="cs-sticky-eyebrow">Beat 5 · your room</div>
        <h2 className="cs-sticky-h2 cs-sticky-h2--centered">
          The world is 52/48. Your room is almost certainly something else.
        </h2>
        <p className="cs-prose cs-sticky-cohort-lede">
          The global average is the average of every room mixed together. It
          does not describe any single room. The only way to find out what your
          room thinks is to ask it. The cohort layer below is what your /results
          page will look like once a few of your friends answer through your
          link.
        </p>
        <CohortTease shareCode={data.viewerShareCode} />
      </section>

      <CtaBlock shareCode={data.viewerShareCode} />
    </CaseStudyShell>
  );
}

/**
 * StickyPair — two-column layout where the right column ("viz") sticks
 * inside the section while the left column ("text") scrolls. The whole
 * section is the sticky container, so the chart unsticks naturally as
 * the section ends and the next one's chart takes over.
 */
function StickyPair({
  viz,
  text,
}: {
  viz: React.ReactNode;
  text: React.ReactNode;
}) {
  return (
    <section className="cs-sticky-pair">
      <div className="cs-sticky-text">{text}</div>
      <div className="cs-sticky-viz">
        <div className="cs-sticky-viz-inner">{viz}</div>
      </div>
    </section>
  );
}
