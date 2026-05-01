import { useEffect, useRef, useState } from "react";
import type { AnswerRequest, AssignedCondition } from "@shared/types";
import {
  answer as saveAnswer,
  assign,
  getStatus,
  submit,
  subscribe,
  verifyEmail,
} from "./api";

/* ---------------------------------------------------------------------- */
/*  State machine                                                         */
/* ---------------------------------------------------------------------- */

type Phase =
  | { kind: "loading" }
  | { kind: "closed" }
  | { kind: "running"; token: string; condition: AssignedCondition; stage: number }
  | {
      kind: "done";
      token: string | null;
      shareCode: string | null;
      // Server-reported state for the Done page state machine. When the row
       // has email_verified_at set, we initialize step to "verified" so we
       // don't ambush the user with a SubscribeForm they've already cleared.
      verified: boolean;
      email: string | null;
    }
  | { kind: "error"; message: string };

type Answers = {
  personal: string | null;
  publicRec: string | null;
  dependent: string | null;
  expected: string | null;
  confidence: number | null;
  reason: string;
};

const EMPTY_ANSWERS: Answers = {
  personal: null,
  publicRec: null,
  dependent: null,
  expected: null,
  confidence: null,
  reason: "",
};

type ChoiceField = "personal" | "publicRec" | "dependent" | "expected";
const CHOICE_QUESTIONS: {
  key: ChoiceField;
  numeral: string;
  meta: string;
  question: string;
  apiField: keyof AnswerRequest;
}[] = [
  {
    key: "personal",
    numeral: "I",
    meta: "Question 01 — Personal",
    question: "Which button would you, personally, press?",
    apiField: "personalChoiceDisplayed",
  },
  {
    key: "publicRec",
    numeral: "II",
    meta: "Question 02 — Prescription",
    question: "Which button would you publicly recommend?",
    apiField: "publicRecommendationDisplayed",
  },
  {
    key: "dependent",
    numeral: "III",
    meta: "Question 03 — A child you love",
    question: "Which button would you tell your child or dependent to press?",
    apiField: "dependentRecommendationDisplayed",
  },
  {
    key: "expected",
    numeral: "IV",
    meta: "Question 04 — Prediction",
    question: "Which button do you think most people will press?",
    apiField: "expectedMajorityDisplayed",
  },
];

const TOTAL_STAGES = CHOICE_QUESTIONS.length + 1;
const FINAL_NUMERAL = "V";
const LOCK_HOLD_MS = 720;

/* ---------------------------------------------------------------------- */
/*  Component                                                             */
/* ---------------------------------------------------------------------- */

export function Poll() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [submitting, setSubmitting] = useState(false);
  const [closesAt, setClosesAt] = useState<string | null>(null);
  const [totalResponses, setTotalResponses] = useState<number | null>(null);
  const [lockedChoice, setLockedChoice] = useState<string | null>(null);
  const advanceTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await getStatus();
        if (cancelled) return;
        setClosesAt(status.closesAt);
        setTotalResponses(status.totalResponses);
        const a = await assign(captureReferrerFromUrl());
        if (cancelled) return;
        if (a.alreadyVoted) {
          setPhase({
            kind: "done",
            // Server now returns responseToken in alreadyVoted when the
            // assignment cookie is still intact, so users who refreshed
            // can still late-bind an email via the SubscribeForm.
            token: a.responseToken ?? null,
            shareCode: a.shareCode ?? null,
            verified: a.verified ?? false,
            email: a.email ?? null,
          });
          return;
        }
        // Resume from any saved partial state. The 4 choice questions are
        // ordered, so the first stage with a null answer is where they left
        // off; if all 4 are answered we drop them on the FinalStage.
        if (a.partial) {
          setAnswers({
            personal: a.partial.personalChoiceDisplayed,
            publicRec: a.partial.publicRecommendationDisplayed,
            dependent: a.partial.dependentRecommendationDisplayed,
            expected: a.partial.expectedMajorityDisplayed,
            confidence: a.partial.confidence,
            reason: a.partial.reasonText ?? "",
          });
        }
        const stage = firstUnansweredStage(a.partial);
        setPhase({
          kind: "running",
          token: a.responseToken,
          condition: a.condition,
          stage,
        });
      } catch (e) {
        if (!cancelled) {
          const message = (e as Error).message;
          setPhase(/poll is closed/i.test(message) ? { kind: "closed" } : { kind: "error", message });
        }
      }
    })();
    return () => {
      cancelled = true;
      if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
    };
  }, []);

  /**
   * Maps the saved partial answers (if any) onto the wizard's stage cursor.
   * Returns the index of the first unanswered choice question, or
   * CHOICE_QUESTIONS.length (the FinalStage) when all four are answered.
   */
  function firstUnansweredStage(p: import("@shared/types").AssignPartial | undefined) {
    if (!p) return 0;
    const order = [
      p.personalChoiceDisplayed,
      p.publicRecommendationDisplayed,
      p.dependentRecommendationDisplayed,
      p.expectedMajorityDisplayed,
    ];
    const idx = order.findIndex((v) => v == null);
    return idx < 0 ? CHOICE_QUESTIONS.length : idx;
  }


  function handleChoice(displayedLabel: string) {
    if (phase.kind !== "running" || lockedChoice !== null) return;
    const stage = phase.stage;
    const q = CHOICE_QUESTIONS[stage];
    if (!q) return;

    setLockedChoice(displayedLabel);
    setAnswers((a) => ({ ...a, [q.key]: displayedLabel }));

    void saveAnswer({
      responseToken: phase.token,
      [q.apiField]: displayedLabel,
    } as AnswerRequest).catch((err) => {
      setPhase({ kind: "error", message: (err as Error).message });
    });

    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = null;
      setLockedChoice(null);
      setPhase((p) => (p.kind === "running" ? { ...p, stage: p.stage + 1 } : p));
    }, LOCK_HOLD_MS);
  }

  function handleConfidence(n: number) {
    if (phase.kind !== "running") return;
    setAnswers((a) => ({ ...a, confidence: n }));
    void saveAnswer({ responseToken: phase.token, confidence: n }).catch((err) => {
      setPhase({ kind: "error", message: (err as Error).message });
    });
  }

  function handleReason(text: string) {
    setAnswers((a) => ({ ...a, reason: text }));
  }

  async function handleSubmit() {
    if (phase.kind !== "running" || submitting) return;
    if (
      answers.personal === null ||
      answers.publicRec === null ||
      answers.dependent === null ||
      answers.expected === null ||
      answers.confidence === null
    ) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await submit({
        responseToken: phase.token,
        reasonText: answers.reason.trim() || undefined,
      });
      setTotalResponses(res.totalResponses);
      // Fresh submit — the user is by definition not yet email-verified
      // (they haven't even seen the SubscribeForm). Server-reported state
      // takes over once they refresh.
      setPhase({
        kind: "done",
        token: phase.token,
        shareCode: res.shareCode ?? null,
        verified: false,
        email: null,
      });
    } catch (e) {
      setPhase({ kind: "error", message: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  /* -------------- Phase rendering -------------- */

  if (phase.kind === "loading")
    return <Shell closesAt={closesAt}><Loading /></Shell>;
  if (phase.kind === "closed")
    return <Shell closesAt={closesAt}><Closed /></Shell>;
  if (phase.kind === "done")
    return (
      <Shell closesAt={closesAt}>
        <Done
          totalResponses={totalResponses}
          token={phase.token}
          shareCode={phase.shareCode}
          serverVerified={phase.verified}
          serverEmail={phase.email}
        />
      </Shell>
    );
  if (phase.kind === "error")
    return (
      <Shell closesAt={closesAt}>
        <ErrorView message={phase.message} />
      </Shell>
    );

  const stage = phase.stage;
  const condition = phase.condition;

  return (
    <Shell closesAt={closesAt} stage={stage}>
      {stage < CHOICE_QUESTIONS.length ? (
        <ChoiceStage
          key={stage}
          stage={stage}
          condition={condition}
          locked={lockedChoice}
          onChoose={handleChoice}
        />
      ) : (
        <FinalStage
          key={stage}
          confidence={answers.confidence}
          reason={answers.reason}
          submitting={submitting}
          onConfidence={handleConfidence}
          onReason={handleReason}
          onSubmit={handleSubmit}
          condition={condition}
        />
      )}
    </Shell>
  );
}

/* ---------------------------------------------------------------------- */
/*  Shell — left study rail + center main + right progress panel          */
/* ---------------------------------------------------------------------- */

function Shell({
  children,
  stage,
  closesAt,
}: {
  children: React.ReactNode;
  stage?: number;
  closesAt: string | null;
}) {
  return (
    <div className="shell">
      <aside className="study-rail" aria-label="Study information">
        <div className="rail-block">
          <span className="rail-label">Study</span>
          <span className="rail-title">Threshold</span>
        </div>
        <div className="rail-block">
          <span className="rail-label">Format</span>
          <span>Anonymous survey</span>
        </div>
        <div className="rail-block">
          <span className="rail-label">Response</span>
          <span>Single submission</span>
        </div>
        {closesAt && <Countdown closesAt={closesAt} />}
        <div className="rail-block rail-date">
          <span className="rail-label">Date</span>
          <span>{dateStamp()}</span>
        </div>
        <a className="rail-results-link" href="/results">
          Already responded? View results →
        </a>
      </aside>

      <main className="study-main">{children}</main>

      <aside className="progress-panel" aria-label="Survey progress">
        {typeof stage === "number" ? (
          <ProgressPanel stage={stage} />
        ) : (
          <div className="progress-empty">Threshold Study</div>
        )}
      </aside>
    </div>
  );
}

function Countdown({ closesAt }: { closesAt: string }) {
  const [remaining, setRemaining] = useState(() => closesAt && deltaUntil(closesAt));
  useEffect(() => {
    setRemaining(deltaUntil(closesAt));
    const id = window.setInterval(() => setRemaining(deltaUntil(closesAt)), 30_000);
    return () => window.clearInterval(id);
  }, [closesAt]);
  return (
    <div className="rail-block rail-countdown">
      <span className="rail-label">Closes in</span>
      <span className="countdown-value">{remaining || "Closing..."}</span>
    </div>
  );
}

function ProgressPanel({ stage }: { stage: number }) {
  const current = Math.min(stage + 1, TOTAL_STAGES);
  return (
    <>
      <div className="progress-kicker">Progress</div>
      <div className="progress-count">
        <span>{current}</span>
        <small>/ {TOTAL_STAGES}</small>
      </div>
      <div className="progress-track" aria-hidden>
        <span style={{ height: `${(current / TOTAL_STAGES) * 100}%` }} />
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------- */
/*  Stages                                                                */
/* ---------------------------------------------------------------------- */

function ChoiceStage({
  stage,
  condition,
  locked,
  onChoose,
}: {
  stage: number;
  condition: AssignedCondition;
  locked: string | null;
  onChoose: (label: string) => void;
}) {
  const q = CHOICE_QUESTIONS[stage]!;
  const isFirst = stage === 0;

  // Button position is randomized per session (via the displayed label hash,
  // which varies across labelConditions) but stable across all questions in
  // the same session. Re-ordering between questions added cognitive load with
  // no experimental benefit — the per-session randomization happens once.
  const orderedLabels = useStableShuffle(
    [condition.displayedThresholdLabel, condition.displayedSafeLabel],
    condition.displayedThresholdLabel,
  );

  return (
    <section className="stage">
      <div className="question-head">
        <span className="numeral">{q.numeral}</span>
        <div>
          <div className="q-meta">{q.meta}</div>
          <h1 className="q-text">{q.question}</h1>
        </div>
      </div>

      {isFirst && <PromptBlock condition={condition} />}

      <div className="choices">
        {orderedLabels.map((label) => (
          <ChoiceCard
            key={label}
            label={label}
            isLocked={locked === label}
            isDimmed={locked !== null && locked !== label}
            disabled={locked !== null}
            onClick={() => onChoose(label)}
          />
        ))}
      </div>

      {!isFirst && <RecallScenario condition={condition} />}
    </section>
  );
}

function ChoiceCard({
  label,
  isLocked,
  isDimmed,
  disabled,
  onClick,
}: {
  label: string;
  isLocked: boolean;
  isDimmed: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const classes = ["choice", isLocked ? "locked" : "", isDimmed ? "dim" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={classes} onClick={onClick} disabled={disabled}>
      <span className="seal" aria-hidden />
      <span className="label">{capitalize(label)}</span>
      <span className="tag">Press to commit</span>
      <span className="underline" aria-hidden />
    </button>
  );
}

function FinalStage({
  confidence,
  reason,
  submitting,
  onConfidence,
  onReason,
  onSubmit,
  condition,
}: {
  confidence: number | null;
  reason: string;
  submitting: boolean;
  onConfidence: (n: number) => void;
  onReason: (s: string) => void;
  onSubmit: () => void;
  condition: AssignedCondition;
}) {
  return (
    <section className="stage">
      <div className="question-head">
        <span className="numeral">{FINAL_NUMERAL}</span>
        <div>
          <div className="q-meta">Question 05 — Reflection</div>
          <h1 className="q-text">How confident are you in your personal choice?</h1>
        </div>
      </div>

      <div className="scale-legend">
        <span>Not confident</span>
        <span>Extremely confident</span>
      </div>
      <div className="scale" role="radiogroup" aria-label="Confidence">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={confidence === n}
            className={confidence === n ? "selected" : ""}
            onClick={() => onConfidence(n)}
          >
            {n}
          </button>
        ))}
      </div>

      <span className="field-label">Why did you choose that button? (optional)</span>
      <textarea
        className="reason"
        value={reason}
        onChange={(e) => onReason(e.target.value)}
        maxLength={500}
        placeholder="A sentence is plenty."
      />
      <div className="counter">{reason.length} / 500</div>

      <div className="submit-row">
        <button
          type="button"
          className="submit"
          disabled={confidence === null || submitting}
          onClick={onSubmit}
        >
          {submitting ? "Recording…" : "Submit response"}
        </button>
        <span className="submit-note">Once submitted, you cannot revise.</span>
      </div>

      <RecallScenario condition={condition} />
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/*  Done — share + subscribe + verify state machine                        */
/* ---------------------------------------------------------------------- */

type DoneStep =
  | { kind: "share" }
  | { kind: "verifying"; email: string }
  | { kind: "verified"; email: string };

function Done({
  totalResponses,
  token,
  shareCode,
  serverVerified,
  serverEmail,
}: {
  totalResponses: number | null;
  token: string | null;
  shareCode: string | null;
  /** From the assign endpoint: did this row already verify its email? */
  serverVerified: boolean;
  /** Email on file when known; only meaningful with serverVerified=true. */
  serverEmail: string | null;
}) {
  // Initialize step from the server-reported state. Three cases:
  //   - row.email_verified_at set       → "verified" (suppress all email UI)
  //   - row.email set, not yet verified  → "verifying" (skip email entry,
  //                                        jump straight to OTC collection)
  //   - no email on file                 → "share" (full SubscribeForm)
  // Local transitions take over after first interaction.
  const [step, setStep] = useState<DoneStep>(() => {
    if (serverVerified && serverEmail) {
      return { kind: "verified", email: serverEmail };
    }
    if (serverEmail) {
      return { kind: "verifying", email: serverEmail };
    }
    return { kind: "share" };
  });
  const [copied, setCopied] = useState(false);
  // Pulses the email/code form when the user hovers/clicks a locked cohort
  // card. Connects the carousel's "verify to unlock" call to the actual UI
  // that performs the unlock.
  const [unlockPulse, setUnlockPulse] = useState<"idle" | "hover" | "click">(
    "idle",
  );

  // Highlight visible email inputs while the user hovers/focuses/clicks
  // a locked card. No scroll, no focus shift, no animation — just a
  // static color/border change so the eye sees "these two are linked."
  // The click state holds longer (~900ms) than hover so a single click
  // still reads as a confirmation gesture before fading.
  function pulseFromCohort(kind: "hover" | "click") {
    setUnlockPulse(kind);
    if (kind === "click") {
      window.setTimeout(() => setUnlockPulse("idle"), 900);
    }
  }
  function clearPulse() {
    setUnlockPulse((p) => (p === "hover" ? "idle" : p));
  }

  // When we know the respondent's share_code, append it as ?ref=<code> so
  // anyone who answers through this link is attributed to them in the cohort
  // tree. Without a code, fall back to the bare site URL.
  const shareUrl =
    typeof window === "undefined"
      ? ""
      : shareCode
        ? `${window.location.origin}/?ref=${shareCode}`
        : `${window.location.origin}/`;
  // Tweet copy is intentionally neutral: no frame, no outcome, no color-loaded
  // wording. Just enough to make a friend curious enough to click through.
  const tweetText =
    "Two buttons. One choice. An anonymous coordination experiment — what would you press?";
  const tweetUrl =
    "https://twitter.com/intent/tweet?text=" +
    encodeURIComponent(tweetText) +
    "&url=" +
    encodeURIComponent(shareUrl);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  // Defensive: if the count is unknown OR somehow comes back below 1 while
  // we're already on the Done page (the row was wiped out from under us, etc.),
  // suppress the rank line entirely rather than render "1 of 0".
  const countLabel =
    totalResponses == null || totalResponses < 1
      ? null
      : totalResponses === 1
        ? "You're the first to answer."
        : `You're 1 of ${totalResponses.toLocaleString()} who have answered so far.`;

  return (
    <section className="coda done-share">
      <div className="done-kicker">Recorded · thank you</div>
      <h1>Done.</h1>
      {countLabel && <p className="done-rank">{countLabel}</p>}

      {/* Primary CTA: email. Lead with the value exchange, not the share. */}
      <div
        className={`unlock-region${unlockPulse !== "idle" ? " unlock-region--" + unlockPulse : ""}`}
      >
        {token && step.kind === "share" && (
          <SubscribeForm
            token={token}
            onSent={(email) => setStep({ kind: "verifying", email })}
          />
        )}
        {token && step.kind === "verifying" && (
          <VerifyForm
            token={token}
            email={step.email}
            onVerified={() => setStep({ kind: "verified", email: step.email })}
            onBack={() => setStep({ kind: "share" })}
          />
        )}
        {step.kind === "verified" && <VerifiedPanel email={step.email} />}
      </div>

      <div className="rule" />

      {/* Secondary CTA: tell a friend. The signal needs N. */}
      <div className="share-block">
        <div className="share-kicker">Pass it on</div>
        <p className="share-body">
          The signal here is meaningful only when many people answer. Send it
          to a friend without spoiling the question.
        </p>
        <div className="done-actions">
          <a
            className="share-twitter"
            href={tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Share on X
          </a>
          <button type="button" className="share-copy" onClick={copy}>
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
        <a className="share-case-study" href="/case-study">
          Read the case study →
        </a>
      </div>

      {shareCode && (
        <CohortPanel
          verified={step.kind === "verified"}
          token={token}
          step={step}
          setStep={setStep}
          onCardEngage={pulseFromCohort}
          onCardLeave={clearPulse}
        />
      )}

      {!token && (
        <p className="done-footer">
          Aggregate results publish when the poll closes.
        </p>
      )}
    </section>
  );
}

function SubscribeForm({
  token,
  onSent,
}: {
  token: string;
  onSent: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await subscribe({ responseToken: token, email: email.trim() });
      onSent(email.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="subscribe">
      <div className="subscribe-kicker">See how it lands</div>
      <h2 className="subscribe-headline">Drop your email to see the result.</h2>
      <p className="subscribe-body">
        Two reasons. <strong>One:</strong> you'll see the live aggregate as
        soon as you confirm — a sneak peek before results publish.
        <strong> Two:</strong> we'll email you once when the final results are
        in.
      </p>
      <form className="subscribe-form" onSubmit={go}>
        <input
          type="email"
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email address"
        />
        <button type="submit" className="submit" disabled={pending || !email.includes("@")}>
          {pending ? "Sending…" : "Send code"}
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

function VerifyForm({
  token,
  email,
  onVerified,
  onBack,
}: {
  token: string;
  email: string;
  onVerified: () => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await verifyEmail({ responseToken: token, code });
      onVerified();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="subscribe">
      <div className="subscribe-kicker">Enter verification code</div>
      <h2 className="subscribe-headline">Check your inbox.</h2>
      <p className="subscribe-body">
        We sent a 6-digit code to <strong>{email}</strong>. The code expires in
        30 minutes.
      </p>
      <form className="otc-form" onSubmit={go}>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="\d{6}"
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          aria-label="Verification code"
          autoFocus
        />
        <button type="submit" className="submit" disabled={code.length !== 6 || pending}>
          {pending ? "Verifying…" : "Verify"}
        </button>
        <button type="button" className="share-copy" onClick={onBack}>
          Use a different email
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

function VerifiedPanel({ email }: { email: string }) {
  return (
    <div className="subscribe verified">
      <div className="subscribe-kicker">Verified ✓</div>
      <h2 className="subscribe-headline">Live preview unlocked.</h2>
      <p className="subscribe-body">
        Confirmed: <strong>{email}</strong>. You can now view the live
        aggregate and we'll email you when results are officially published.
      </p>
      <div className="done-actions">
        <a className="share-twitter" href="/results">
          View your results
        </a>
      </div>
    </div>
  );
}

/**
 * Personal cohort teaser shown on the Done page.
 *
 * Rationale: the cohort viz lives on /results (single canonical "your view"
 * page). This panel exists only to (a) tell the user the feature exists,
 * (b) entice them with what they'll unlock by sharing/verifying, and
 * (c) link to /results when they're ready.
 *
 * Two states:
 *  - unverified: "View your results" is greyed; the silhouette is dimmer
 *    and the prompt asks them to verify above.
 *  - verified: link is live; preview is at full "locked" intensity.
 */
function CohortPanel({
  verified,
  token,
  step,
  setStep,
  onCardEngage,
  onCardLeave,
}: {
  verified: boolean;
  /**
   * Survey response token from the parent. Required to drive the inline
   * subscribe/verify forms; null when the user is on the abbreviated
   * already-voted Done state and we have no live token.
   */
  token: string | null;
  step: DoneStep;
  setStep: (step: DoneStep) => void;
  onCardEngage: (kind: "hover" | "click") => void;
  onCardLeave: () => void;
}) {
  // The inline form is a *second* entry point to the same subscribe flow
  // that lives at the top of the Done page. Both forms write to the same
  // parent step state, so they advance together.
  // Show the inline subscribe form right away. The cohort panel is the
  // user's second-look-and-decide moment; not making them click an extra
  // button to even see the email field.
  const [inlineOpen, setInlineOpen] = useState(true);
  // Auto-open when the parent moves the user into verifying/verified state
  // — if they used the top form, the inline panel should reflect that.
  useEffect(() => {
    if (step.kind !== "share") setInlineOpen(true);
  }, [step.kind]);

  return (
    <div className="cohort-panel">
      <div className="share-kicker">Unlock your cohort</div>
      <p className="share-body">
        Share your link with three people to unlock <strong>your cohort</strong>.
        The four samples below are a preview — your full view will show your
        cohort's actual numbers, comparisons across depth, and how it diverges
        from the world.
      </p>
      <LockedCohortCarousel onCardEngage={onCardEngage} onCardLeave={onCardLeave} />

      <div className="done-actions">
        <a className="share-twitter" href="/results">
          View your results
        </a>
      </div>

      {!verified && inlineOpen && token && step.kind === "share" && (
        <div className="cohort-inline-form unlock-region">
          <SubscribeForm
            token={token}
            onSent={(email) => setStep({ kind: "verifying", email })}
          />
        </div>
      )}
      {!verified && inlineOpen && token && step.kind === "verifying" && (
        <div className="cohort-inline-form unlock-region">
          <VerifyForm
            token={token}
            email={step.email}
            onVerified={() => setStep({ kind: "verified", email: step.email })}
            onBack={() => setStep({ kind: "share" })}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Locked cohort carousel — four sample-data viz cards in a horizontal
 * scroll, each with a frosted veil + "Verify to unlock" overlay. Replaces
 * the older silhouette preview. The cards always show sample data on the
 * Done page; the real data lives at /results once the user verifies.
 *
 * Each card's SVG is hand-rolled (no chart library) for byte-cost reasons:
 * the four shapes are static and total ~2 KB inline. The veil overlay is
 * rendered via CSS .locked-card .lock-veil so the lock state is purely a
 * styling concern and never mutates the underlying viz markup.
 */
function LockedCohortCarousel({
  onCardEngage,
  onCardLeave,
}: {
  onCardEngage: (kind: "hover" | "click") => void;
  onCardLeave: () => void;
}) {
  // The cards live in a flex-row scroll lane; each card carries its own
  // hover/click handlers that bubble back to Done so the form pulses.
  const handlers = { onCardEngage, onCardLeave };
  return (
    <div className="locked-carousel" aria-label="Sample cohort visualizations">
      <DriftCard {...handlers} />
      <BigNumberCard {...handlers} />
      <ConstellationCard {...handlers} />
      <RadarCard {...handlers} />
    </div>
  );
}

type CardEngageProps = {
  onCardEngage: (kind: "hover" | "click") => void;
  onCardLeave: () => void;
};

/* Each card has the same outer chrome: kicker, title, viz, then a frosted
   .lock-veil overlay anchored to the card's relative box. */
function LockedCard({
  label,
  children,
  onCardEngage,
  onCardLeave,
}: {
  label: string;
  children: React.ReactNode;
} & CardEngageProps) {
  return (
    <button
      type="button"
      className="locked-card"
      onMouseEnter={() => onCardEngage("hover")}
      onMouseLeave={onCardLeave}
      onFocus={() => onCardEngage("hover")}
      onBlur={onCardLeave}
      onClick={() => onCardEngage("click")}
    >
      <span className="sample-badge" aria-hidden="true">Sample</span>
      <div className="locked-card-label">{label}</div>
      <div className="locked-card-viz" aria-hidden="true">
        {children}
      </div>
    </button>
  );
}

function DriftCard(props: CardEngageProps) {
  return (
    <LockedCard
      label="Drift"
      {...props}
    >
      <svg viewBox="0 0 320 130" preserveAspectRatio="xMidYMid meet" role="img">
        <line x1="0" y1="78" x2="320" y2="78" stroke="#d3cdbb" strokeDasharray="3 3" />
        <polyline points="40,16 160,16 280,80" fill="none" stroke="#1f4886" strokeWidth="2.5" />
        <circle cx="40" cy="16" r="5" fill="#1f4886" />
        <circle cx="160" cy="16" r="5" fill="#1f4886" />
        <circle cx="280" cy="80" r="5" fill="#a8331e" />
      </svg>
    </LockedCard>
  );
}

function BigNumberCard(props: CardEngageProps) {
  return (
    <LockedCard
      label="Big number"
      {...props}
    >
      <div className="locked-bignum">79%</div>
      <div className="locked-bignum-vs">
        <strong>↑ 7 pp</strong> more cooperative than world
      </div>
      <div className="locked-bignum-strip">
        <span style={{ width: "79%", background: "var(--communal)" }} />
        <span style={{ width: "21%", background: "var(--selfish)" }} />
      </div>
    </LockedCard>
  );
}

function ConstellationCard(props: CardEngageProps) {
  return (
    <LockedCard
      label="Constellation"
      {...props}
    >
      <svg viewBox="0 0 340 200" preserveAspectRatio="xMidYMid meet" role="img">
        <circle cx="170" cy="100" r="40" fill="none" stroke="#d3cdbb" strokeDasharray="3 3" />
        <circle cx="170" cy="100" r="75" fill="none" stroke="#d3cdbb" strokeDasharray="3 3" />
        <line x1="170" y1="100" x2="200" y2="70" stroke="#5b6055" />
        <line x1="170" y1="100" x2="140" y2="70" stroke="#5b6055" />
        <line x1="170" y1="100" x2="140" y2="130" stroke="#5b6055" />
        <line x1="170" y1="100" x2="200" y2="130" stroke="#5b6055" />
        <line x1="200" y1="70" x2="235" y2="50" stroke="#5b6055" />
        <line x1="200" y1="70" x2="245" y2="95" stroke="#5b6055" />
        <line x1="140" y1="70" x2="100" y2="50" stroke="#5b6055" />
        <circle cx="170" cy="100" r="9" fill="#263d31" />
        <circle cx="200" cy="70" r="6" fill="#1f4886" />
        <circle cx="140" cy="70" r="6" fill="#1f4886" />
        <circle cx="140" cy="130" r="6" fill="#1f4886" />
        <circle cx="200" cy="130" r="6" fill="#a8331e" />
        <circle cx="235" cy="50" r="5" fill="#1f4886" />
        <circle cx="245" cy="95" r="5" fill="#a8331e" />
        <circle cx="100" cy="50" r="5" fill="#1f4886" />
      </svg>
    </LockedCard>
  );
}

function RadarCard(props: CardEngageProps) {
  return (
    <LockedCard
      label="Radar"
      {...props}
    >
      <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet" role="img">
        <g stroke="#d3cdbb" fill="none" strokeDasharray="2 3">
          <circle cx="160" cy="110" r="30" />
          <circle cx="160" cy="110" r="60" />
          <circle cx="160" cy="110" r="85" />
        </g>
        <line x1="160" y1="110" x2="160" y2="25" stroke="#5b6055" />
        <line x1="160" y1="110" x2="245" y2="110" stroke="#5b6055" />
        <line x1="160" y1="110" x2="160" y2="195" stroke="#5b6055" />
        <line x1="160" y1="110" x2="75" y2="110" stroke="#5b6055" />
        <polygon
          points="160,65 220,110 160,125 130,110"
          fill="#5b605533" stroke="#5b6055" strokeDasharray="3 3"
        />
        <polygon
          points="160,65 230,110 160,124 132,110"
          fill="rgba(38,61,49,0.5)" stroke="#263d31" strokeWidth={2}
        />
      </svg>
    </LockedCard>
  );
}



/* ---------------------------------------------------------------------- */
/*  Other end states                                                      */
/* ---------------------------------------------------------------------- */

function Loading() {
  return (
    <section className="stage">
      <p className="prompt" style={{ fontStyle: "italic", color: "var(--muted)" }}>
        Setting the table…
      </p>
    </section>
  );
}

function Closed() {
  return (
    <section className="coda">
      <h1>The poll has closed.</h1>
      <div className="rule" />
      <p>Thank you for your interest. No further responses are being accepted.</p>
    </section>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <section className="coda">
      <h1>Something went sideways.</h1>
      <div className="rule" />
      <p className="error-text">{message}</p>
      <p>Refreshing the page will start a new assignment.</p>
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/*  Prompt rendering                                                       */
/* ---------------------------------------------------------------------- */

function PromptBlock({ condition }: { condition: AssignedCondition }) {
  if (condition.promptIsHtml) {
    return (
      <div
        className="prompt"
        dangerouslySetInnerHTML={{ __html: condition.promptText }}
      />
    );
  }
  return (
    <div className="prompt">
      <p>{condition.promptText}</p>
    </div>
  );
}

function RecallScenario({ condition }: { condition: AssignedCondition }) {
  return (
    <details className="recall">
      <summary>Recall the scenario</summary>
      <PromptBlock condition={condition} />
    </details>
  );
}

/* ---------------------------------------------------------------------- */
/*  Helpers                                                               */
/* ---------------------------------------------------------------------- */

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function dateStamp(): string {
  const d = new Date();
  return d
    .toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    .toUpperCase();
}

function deltaUntil(iso: string): string {
  const ms = new Date(iso).valueOf() - Date.now();
  if (!isFinite(ms) || ms <= 0) return "";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function useStableShuffle<T>(items: T[], key: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const r = (h >>> 0) / 0xffffffff;
  return r >= 0.5 ? [...items].reverse() : items;
}


/**
 * Read referrer / UTM params off the page URL on first load. After we read
 * them, we strip them from the URL via history.replaceState so that if the
 * user shares the tab URL it doesn't carry someone else's attribution.
 * The captured values are then included in the /api/poll/assign POST body
 * and persisted on the row via the signed token.
 */
function captureReferrerFromUrl(): import("./api").ReferrerData | undefined {
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  const fields = ["ref", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
  const data: Record<string, string> = {};
  let touched = false;
  for (const k of fields) {
    const v = params.get(k);
    if (v) {
      data[k] = v;
      params.delete(k);
      touched = true;
    }
  }
  if (touched) {
    const remaining = params.toString();
    const cleanUrl =
      window.location.pathname + (remaining ? `?${remaining}` : "") + window.location.hash;
    window.history.replaceState(null, "", cleanUrl);
    return data as import("./api").ReferrerData;
  }
  return undefined;
}