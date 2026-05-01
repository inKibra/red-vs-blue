import { useEffect, useState } from "react";
import type {
  CohortBucket,
  CohortNode,
  CohortResponse,
  CohortSplit,
  PublicResultsResponse,
} from "@shared/types";
import { getPublicResults, sendPreviewLink } from "./api";

type State =
  | { kind: "loading" }
  | { kind: "unpublished" }
  | { kind: "ok"; data: PublicResultsResponse }
  | { kind: "error"; message: string };

/**
 * /results — single canonical "what came of it" page.
 *
 * For unverified anonymous visitors before publish: gentle gate prompting
 * them to take the survey + verify email.
 *
 * For verified subscribers (rb_preview cookie): live-preview world aggregate
 * AND, if they themselves submitted, their personal cohort tree inline.
 *
 * For everyone after publish: world aggregate, no cohort (no identity).
 */
export function Results() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    getPublicResults()
      .then((data) => setState({ kind: "ok", data }))
      .catch((err: Error) => {
        if (/not been published/i.test(err.message)) {
          setState({ kind: "unpublished" });
        } else {
          setState({ kind: "error", message: err.message });
        }
      });
  }, []);

  return (
    <div className="results-shell">
      <header className="results-mast">
        <a href="/" className="results-back">← The Threshold Study</a>
        <span className="results-meta">Results</span>
      </header>

      {state.kind === "loading" && (
        <p className="results-loading">Loading results…</p>
      )}

      {state.kind === "unpublished" && <Unpublished onUnlock={() => location.reload()} />}

      {state.kind === "error" && (
        <section className="results-coda">
          <h1>Something went sideways.</h1>
          <p className="error-text">{state.message}</p>
        </section>
      )}

      {state.kind === "ok" && <ResultsView data={state.data} />}
    </div>
  );
}

function ResultsView({ data }: { data: PublicResultsResponse }) {
  const totalLabel = data.totalResponses.toLocaleString();
  const shareUrl =
    typeof window === "undefined" ? "https://" : `${window.location.origin}/results`;
  const shareText = `${totalLabel} people answered The Threshold Study. The results are in.`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    shareText,
  )}&url=${encodeURIComponent(shareUrl)}`;

  return (
    <main className="results-main">
      {data.preview && (
        <div className="preview-banner">
          <div className="preview-kicker">Live preview · subscribers only</div>
          <p>
            Aggregate numbers update with every response and may shift before
            the official publish. Please don't share these screenshots —
            wait for the public release.
          </p>
        </div>
      )}

      {/* ----- World aggregate (always present) -------------------------- */}
      <section className="results-hero">
        <div className="results-kicker">
          {data.preview ? "Live preview" : "The Threshold Study · results"}
        </div>
        <h1 className="results-headline">
          {data.thresholdPercent}% chose threshold.
        </h1>
        <p className="results-deck">
          Of {totalLabel} who answered, {data.thresholdPercent}% would press
          the threshold button and {data.safePercent}% the safe one. Average
          confidence: {data.averageConfidence.toFixed(2)} of 5.
        </p>
        {!data.preview && (
          <div className="results-actions">
            <a className="share-twitter" href={twitterUrl} target="_blank" rel="noopener">
              Share on X
            </a>
            {data.publishedAt && (
              <span className="results-published-at">
                Published {fmt(data.publishedAt)}
              </span>
            )}
          </div>
        )}
      </section>

      <section className="results-split">
        <SplitBar
          title="Personal choice — what would you press?"
          a={{ label: "Threshold", percent: data.thresholdPercent }}
          b={{ label: "Safe", percent: data.safePercent }}
        />
        <SplitBar
          title="Public recommendation — what should everyone press?"
          a={{ label: "Threshold", percent: data.publicThresholdPercent }}
          b={{ label: "Safe", percent: 100 - data.publicThresholdPercent }}
        />
        <SplitBar
          title="Dependent — what would you tell a child to press?"
          a={{ label: "Threshold", percent: data.dependentThresholdPercent }}
          b={{ label: "Safe", percent: 100 - data.dependentThresholdPercent }}
        />
      </section>

      {/* ----- Personal cohort (only when authed + has share_code) ------- */}
      {/* Cohort viz only renders when the viewer has actually grown a tree.
          A code with zero descendants doesn't earn the four panels — there
          is nothing to compare. The viewer still sees the world aggregate
          above. Once one person responds through their link, this unlocks. */}
      {data.cohort && data.cohort.tree.total > 0 && (
        <CohortPanels cohort={data.cohort} />
      )}

      <footer className="results-footer">
        <p className="muted-note">
          Top-line numbers only. The full per-condition breakdown is in the
          paper / writeup that accompanies this study.
        </p>
      </footer>
    </main>
  );
}

/* ====================================================================== */
/*  Cohort sections (formerly /c/<code>, now folded inline into /results)   */
/* ====================================================================== */

export function CohortPanels({ cohort }: { cohort: CohortResponse }) {
  const { tree, buckets, world, kAnonThreshold } = cohort;
  const headline =
    tree.total === 0
      ? "No one has answered through your link yet."
      : tree.total === 1
        ? "1 person answered through your link."
        : `${tree.total.toLocaleString()} people answered through your link.`;

  return (
    <>
      <section className="results-hero" style={{ marginTop: 28 }}>
        <div className="results-kicker">Your cohort</div>
        <h1 className="results-headline">{headline}</h1>
        <p className="results-deck">
          {tree.direct.toLocaleString()} direct ·{" "}
          {tree.secondary.toLocaleString()} second-degree ·{" "}
          {tree.deeper.toLocaleString()} deeper.
        </p>
      </section>

      <section className="cohort-section">
        <h2 className="cohort-h2">Where they came from</h2>
        <p className="cohort-explain">
          Each respondent is one of three things relative to you.
          <strong> Direct</strong> answered through your link.
          <strong> Second-degree</strong> answered through someone you
          recruited. <strong>Deeper</strong> is everyone past that —
          friends-of-friends-of-friends.
        </p>
        <DepthBar tree={tree} />
      </section>

      <section className="cohort-section">
        <h2 className="cohort-h2">What they pressed</h2>
        <p className="cohort-explain">
          Four lenses on the same data: the headline number, how the choice
          drifts as the chain widens, the four-question profile, and the
          shape of the network you spawned.
        </p>
        <CohortVizGrid cohort={cohort} />
      </section>

      <section className="cohort-section">
        <h2 className="cohort-h2">By question, in detail</h2>
        <p className="cohort-explain">
          Every respondent answered <strong>four</strong> questions about the
          same dilemma. Each row below shows your cohort's split, the world's
          split, and the gap between them.
        </p>
        <ul className="cohort-questions">
          <li><strong>Personal choice</strong> — what would <em>you</em> press?</li>
          <li><strong>Community recommendation</strong> — what should <em>everyone</em> press?</li>
          <li><strong>For someone you love</strong> — what would you tell a child to press?</li>
          <li><strong>Prediction</strong> — what do you think most people <em>will</em> press?</li>
        </ul>
        <p className="cohort-legend">
          <span className="dot dot-safe" aria-hidden="true" />
          <strong>Safe</strong> — guarantees you survive, no matter how others
          vote.
          <span
            className="dot dot-threshold"
            aria-hidden="true"
            style={{ marginLeft: 18 }}
          />
          <strong>Threshold</strong> — if more than half press it, everyone
          survives; otherwise threshold-pressers die.
        </p>

        <BucketRow
          label="Your whole cohort"
          sublabel={`${buckets.total.count} people`}
          bucket={buckets.total}
          world={world}
          kAnon={kAnonThreshold}
        />
      </section>

      <section className="cohort-section">
        <h2 className="cohort-h2">Does it shift with distance?</h2>
        <p className="cohort-explain">
          The same four questions, broken out by how far someone is from you
          in the invitation chain. If your direct friends and the
          friends-of-friends-of-friends answer the same way, the signal is
          spreading cleanly. If they diverge, you're watching the message
          mutate as it travels. Buckets with fewer than {kAnonThreshold}{" "}
          people stay locked to protect their anonymity.
        </p>

        <BucketRow
          label="Direct"
          sublabel="people who clicked your link"
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
      </section>
    </>
  );
}

/* ---------------------------------------------------------------------- */
/*  Subcomponents                                                          */
/* ---------------------------------------------------------------------- */

function SplitBar({
  title,
  a,
  b,
}: {
  title: string;
  a: { label: string; percent: number };
  b: { label: string; percent: number };
}) {
  return (
    <div className="split-card">
      <div className="split-title">{title}</div>
      <div className="split-bar">
        <span className="split-fill split-a" style={{ width: `${a.percent}%` }}>
          {a.percent >= 8 ? `${a.label} · ${a.percent.toFixed(1)}%` : ""}
        </span>
        <span className="split-fill split-b" style={{ width: `${b.percent}%` }}>
          {b.percent >= 8 ? `${b.label} · ${b.percent.toFixed(1)}%` : ""}
        </span>
      </div>
      <div className="split-legend">
        <span>{a.label} {a.percent.toFixed(1)}%</span>
        <span>{b.label} {b.percent.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function DepthBar({ tree }: { tree: CohortResponse["tree"] }) {
  const total = Math.max(1, tree.total);
  const pct = (n: number) => (tree.total === 0 ? 0 : (n / total) * 100);
  return (
    <div className="depth-card">
      <div className="depth-bar">
        <span className="depth-fill depth-direct" style={{ width: `${pct(tree.direct)}%` }}>
          {pct(tree.direct) >= 10 ? tree.direct : ""}
        </span>
        <span className="depth-fill depth-secondary" style={{ width: `${pct(tree.secondary)}%` }}>
          {pct(tree.secondary) >= 10 ? tree.secondary : ""}
        </span>
        <span className="depth-fill depth-deeper" style={{ width: `${pct(tree.deeper)}%` }}>
          {pct(tree.deeper) >= 10 ? tree.deeper : ""}
        </span>
      </div>
      <div className="depth-legend">
        <span><span className="dot dot-direct" /> Direct {tree.direct}</span>
        <span><span className="dot dot-secondary" /> Second-degree {tree.secondary}</span>
        <span><span className="dot dot-deeper" /> Deeper {tree.deeper}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Cohort visualization grid (Drift / BigNumber / Constellation / Radar)  */
/* ---------------------------------------------------------------------- */

/**
 * Wraps the four cards. The grid collapses 2x2 → 1-col on narrow viewports
 * via the .cohort-viz-grid CSS class. Each card is independent and tolerates
 * partial data: locked buckets show as gaps in the drift line, an empty
 * cohort collapses the constellation to just the viewer node, and so on.
 */
function CohortVizGrid({ cohort }: { cohort: CohortResponse }) {
  return (
    <div className="cohort-viz-grid">
      <BigNumberCard bucket={cohort.buckets.total} world={cohort.world} />
      <DriftCard
        buckets={cohort.buckets}
        world={cohort.world}
        viewerChoice={cohort.nodes.find((n) => n.depth === 0)?.personalChoice ?? null}
      />
      <RadarCard bucket={cohort.buckets.total} world={cohort.world} />
      <ConstellationCard nodes={cohort.nodes} />
    </div>
  );
}

/* ---- BigNumber: cohort threshold% vs world, with pp delta -------------- */

function BigNumberCard({
  bucket,
  world,
}: {
  bucket: CohortBucket;
  world: CohortResponse["world"];
}) {
  const cohortPct = bucket.personal?.thresholdPercent ?? null;
  const worldPct = world.personal.thresholdPercent;
  // pp delta is null when the cohort bucket itself is k-anon-locked; we still
  // show the world value but the headline is muted.
  const delta = cohortPct == null ? null : Math.round((cohortPct - worldPct) * 10) / 10;
  const arrow = delta == null ? "" : delta > 0 ? "\u2191" : delta < 0 ? "\u2193" : "\u2192";
  const direction = delta == null
    ? ""
    : delta > 0
      ? "more cooperative than world"
      : delta < 0
        ? "less cooperative than world"
        : "matches world exactly";
  return (
    <VizCard label="Cohort vs world">
      <div className="locked-bignum">
        {cohortPct == null ? "—" : `${Math.round(cohortPct)}%`}
      </div>
      <div className="locked-bignum-vs">
        {delta == null ? (
          <span>{`world: ${Math.round(worldPct)}% threshold`}</span>
        ) : (
          <>
            <strong>{`${arrow} ${Math.abs(delta).toFixed(1)} pp`}</strong> {direction}
          </>
        )}
      </div>
      <div className="locked-bignum-strip" aria-hidden="true">
        <span style={{ width: `${cohortPct ?? 0}%`, background: "var(--communal)" }} />
        <span style={{ width: `${100 - (cohortPct ?? 0)}%`, background: "var(--selfish)" }} />
      </div>
    </VizCard>
  );
}

/* ---- Drift: personal threshold% across [you, direct, secondary, deeper] */

function DriftCard({
  buckets,
  world,
  viewerChoice,
}: {
  buckets: CohortResponse["buckets"];
  world: CohortResponse["world"];
  /** Viewer's own threshold/safe pick; degenerates to 100% / 0% on the line. */
  viewerChoice: "threshold" | "safe" | null;
}) {
  // "You" anchors the chain at depth 0. A single respondent is by definition
  // 100% of their own choice; this is the only honest rendering since the
  // viewer is one row, not a distribution. Null choice (partial submit) gets
  // omitted entirely so the line starts at depth 1.
  const youPct: number | null =
    viewerChoice === "threshold" ? 100
    : viewerChoice === "safe" ? 0
    : null;
  // Each tier becomes one point on the polyline. Locked buckets (< K_ANON)
  // get null and we skip them so the line connects only known points; this
  // is honest about gaps rather than interpolating.
  type Pt = { label: string; pct: number | null };
  const pts: Pt[] = [
    { label: "You",        pct: youPct },
    { label: "Direct",     pct: buckets.direct.personal?.thresholdPercent ?? null },
    { label: "2nd-degree", pct: buckets.secondary.personal?.thresholdPercent ?? null },
    { label: "Deeper",     pct: buckets.deeper.personal?.thresholdPercent ?? null },
  ];
  const W = 320, H = 130, padX = 24, padY = 20;
  const xOf = (i: number) => padX + (i * (W - 2 * padX)) / (pts.length - 1);
  const yOf = (pct: number) => H - padY - (pct / 100) * (H - 2 * padY);
  const yWorld = yOf(world.personal.thresholdPercent);
  const known = pts
    .map((p, i) => (p.pct == null ? null : { i, pct: p.pct }))
    .filter((p): p is { i: number; pct: number } => p !== null);
  const polyPts = known.map((p) => `${xOf(p.i)},${yOf(p.pct)}`).join(" ");
  return (
    <VizCard label="Drift across the chain">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Personal threshold percentage by depth in the cohort chain">
        {/* world reference line */}
        <line x1={padX} y1={yWorld} x2={W - padX} y2={yWorld} stroke="#d3cdbb" strokeDasharray="3 3" />
        <text x={W - padX} y={yWorld - 4} textAnchor="end" fontSize="11" fontWeight="500" fill="#5b6055" fontFamily="ui-monospace, monospace">
          world {Math.round(world.personal.thresholdPercent)}%
        </text>
        {/* polyline */}
        {known.length >= 2 && (
          <polyline points={polyPts} fill="none" stroke="#1f4886" strokeWidth="2.5" />
        )}
        {/* dots */}
        {known.map((p) => (
          <circle
            key={p.i}
            cx={xOf(p.i)}
            cy={yOf(p.pct)}
            r="5"
            fill={p.pct >= world.personal.thresholdPercent ? "#1f4886" : "#a8331e"}
          />
        ))}
        {/* x-axis labels */}
        {pts.map((p, i) => (
          <text
            key={p.label}
            x={xOf(i)}
            y={H - 4}
            textAnchor="middle"
            fontSize="11"
            fontWeight="500"
            fill="#5b6055"
            fontFamily="ui-monospace, monospace"
          >
            {p.label}
          </text>
        ))}
      </svg>
    </VizCard>
  );
}


/* ---- Radar: 4-question profile, cohort polygon vs world dashed --------- */

function RadarCard({
  bucket,
  world,
}: {
  bucket: CohortBucket;
  world: CohortResponse["world"];
}) {
  const cx = 160, cy = 100, R = 75;
  // 4 axes at top/right/bottom/left (12, 3, 6, 9 o'clock).
  // Question keys live both on `world` and on `bucket`; narrowing to this
  // union avoids `world.totalResponses` (a number, not a CohortSplit) leaking
  // into the polygon math.
  type QuestionKey = "personal" | "community" | "dependent" | "expected";
  const axes: Array<{ key: QuestionKey; angle: number; label: string }> = [
    { key: "personal",  angle: -Math.PI / 2,         label: "Personal"  },
    { key: "community", angle: 0,                    label: "Community" },
    { key: "dependent", angle: Math.PI / 2,          label: "Dependent" },
    { key: "expected",  angle: Math.PI,              label: "Expected"  },
  ];
  const point = (pct: number, angle: number) => {
    const r = (pct / 100) * R;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };
  const labelPoint = (angle: number) => [
    cx + (R + 14) * Math.cos(angle),
    cy + (R + 14) * Math.sin(angle),
  ];
  const cohortPolygon = axes
    .map((a) => {
      const split = bucket[a.key] as CohortSplit | null;
      const pct = split?.thresholdPercent ?? 0;
      return point(pct, a.angle).join(",");
    })
    .join(" ");
  const worldPolygon = axes
    .map((a) => point(world[a.key].thresholdPercent, a.angle).join(","))
    .join(" ");
  const cohortLocked = bucket.personal == null;
  return (
    <VizCard label="Four-question profile">
      <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Cohort threshold percentages across the four questions, compared to world">
        {/* concentric rings at 25/50/75/100% */}
        <g stroke="#d3cdbb" fill="none" strokeDasharray="2 3">
          {[0.33, 0.66, 1].map((f) => (
            <circle key={f} cx={cx} cy={cy} r={R * f} />
          ))}
        </g>
        {/* axes */}
        {axes.map((a) => {
          const [ex, ey] = point(100, a.angle);
          return <line key={a.key} x1={cx} y1={cy} x2={ex} y2={ey} stroke="#d3cdbb" />;
        })}
        {/* world (dashed reference) */}
        <polygon points={worldPolygon} fill="#5b605522" stroke="#5b6055" strokeDasharray="3 3" />
        {/* cohort (solid accent) */}
        {!cohortLocked && (
          <polygon points={cohortPolygon} fill="rgba(38,61,49,0.5)" stroke="#263d31" strokeWidth={2} />
        )}
        {/* axis labels */}
        {axes.map((a) => {
          const [lx, ly] = labelPoint(a.angle);
          return (
            <text
              key={a.key + "label"}
              x={lx}
              y={ly}
              textAnchor={Math.cos(a.angle) > 0.3 ? "start" : Math.cos(a.angle) < -0.3 ? "end" : "middle"}
              dominantBaseline="middle"
              fontSize="12"
              fontWeight="500"
              fontFamily="ui-monospace, monospace"
              fill="#5b6055"
            >
              {a.label}
            </text>
          );
        })}
      </svg>
    </VizCard>
  );
}

/* ---- Constellation: tree as radial node-link diagram ------------------- */

function ConstellationCard({ nodes }: { nodes: CohortNode[] }) {
  const cx = 170, cy = 100, ringStep = 28;
  // Recursive radial layout: each node owns an angular wedge centered on its
  // parent's angle; children divide that wedge evenly. The root sits at the
  // center and gets the full 2π. Wedges shrink with depth so the tree fans
  // outward without children overlapping siblings of the parent's siblings.
  const positioned = layoutConstellation(nodes, cx, cy, ringStep);
  // Edge list: each non-root node → its parent. Skip when parent missing
  // (truncated tree branches).
  const byId = new Map(positioned.map((n) => [n.id, n]));
  const edges = positioned
    .filter((n) => n.parent && byId.has(n.parent))
    .map((n) => {
      const p = byId.get(n.parent!)!;
      return { from: p, to: n };
    });
  return (
    <VizCard label="Your network">
      <svg viewBox="0 0 340 200" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Network of ${positioned.length} respondents starting from you`}>
        {edges.map((e, i) => (
          <line
            key={i}
            x1={e.from.x} y1={e.from.y}
            x2={e.to.x}   y2={e.to.y}
            stroke="#5b6055"
            strokeOpacity="0.55"
          />
        ))}
        {positioned.map((n) => {
          const isRoot = n.depth === 0;
          const fill = n.personalChoice === "threshold"
            ? "#1f4886"
            : n.personalChoice === "safe"
              ? "#a8331e"
              : "#a89e88";
          return (
            <circle
              key={n.id}
              cx={n.x}
              cy={n.y}
              r={isRoot ? 9 : Math.max(3, 7 - n.depth)}
              fill={isRoot ? "#263d31" : fill}
              stroke={isRoot ? "#fff" : "none"}
              strokeWidth={isRoot ? 2 : 0}
            />
          );
        })}
        {positioned.length <= 1 && (
          <text
            x={cx}
            y={cy + 30}
            textAnchor="middle"
            fontSize="12"
            fontWeight="500"
            fontFamily="ui-monospace, monospace"
            fill="#5b6055"
          >
            Share your link to grow this.
          </text>
        )}
      </svg>
    </VizCard>
  );
}

type LaidOut = CohortNode & { x: number; y: number };

function layoutConstellation(
  nodes: CohortNode[],
  cx: number,
  cy: number,
  ringStep: number,
): LaidOut[] {
  if (nodes.length === 0) return [];
  const maxRadius = Math.max(ringStep, Math.min(cx, cy) - 16);
  const uniqueNodes = Array.from(
    new Map(nodes.map((n) => [n.id, n])).values(),
  );
  // Build child index keyed by parent id. Self-links are corrupt data; route
  // them through fallback placement rather than recursing forever.
  const children = new Map<string | null, CohortNode[]>();
  for (const n of uniqueNodes) {
    if (n.parent === n.id) continue;
    const list = children.get(n.parent) ?? [];
    list.push(n);
    children.set(n.parent, list);
  }
  const root = uniqueNodes.find((n) => n.parent === null) ?? uniqueNodes[0];
  const out: LaidOut[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function clampedRadius(depth: number) {
    return Math.min(Math.max(0, depth) * ringStep, maxRadius);
  }

  function place(node: CohortNode, angle: number, span: number) {
    if (visited.has(node.id) || visiting.has(node.id)) return;
    visiting.add(node.id);
    const r = clampedRadius(node.depth);
    const x = node.depth === 0 ? cx : cx + r * Math.cos(angle);
    const y = node.depth === 0 ? cy : cy + r * Math.sin(angle);
    out.push({ ...node, x, y });
    const kids = children.get(node.id) ?? [];
    // Children fan out across the wedge centered on this node's angle.
    const childSpan = node.depth === 0 ? Math.PI * 2 : span * 0.85;
    const start = node.depth === 0 ? -Math.PI / 2 : angle - childSpan / 2;
    kids.forEach((k, i) => {
      // Distribute children across the wedge with half-step inset so siblings
      // don't collide with the wedge boundaries.
      const t = (i + 0.5) / kids.length;
      const a = node.depth === 0
        ? start + t * Math.PI * 2
        : start + t * childSpan;
      place(k, a, childSpan);
    });
    visiting.delete(node.id);
    visited.add(node.id);
  }

  place(root, 0, Math.PI * 2);
  // Backstop: any node not visited (orphaned in truncated/corrupt tree) gets
  // a clamped fallback slot so it still appears inside the SVG viewBox.
  const leftover = uniqueNodes.filter((n) => !visited.has(n.id));
  leftover.forEach((n, i) => {
    const a = (i / Math.max(1, leftover.length)) * Math.PI * 2;
    const r = Math.min((Math.max(0, n.depth) + 1) * ringStep, maxRadius);
    out.push({
      ...n,
      x: cx + r * Math.cos(a),
      y: cy + r * Math.sin(a),
    });
  });
  return out;
}

/* ---- Shared card chrome ------------------------------------------------ */

function VizCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="viz-card">
      <div className="locked-card-label">{label}</div>
      <div className="locked-card-viz">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Per-bucket detail (cohort vs world for each of the 4 questions)        */
/* ---------------------------------------------------------------------- */

function BucketRow({
  label,
  sublabel,
  bucket,
  world,
  kAnon,
  compact,
}: {
  label: string;
  sublabel: string;
  bucket: CohortBucket;
  world: CohortResponse["world"];
  kAnon: number;
  compact?: boolean;
}) {
  const locked = bucket.personal == null;
  const need = Math.max(0, kAnon - bucket.count);

  return (
    <div className={`bucket-row${compact ? " bucket-row--compact" : ""}`}>
      <div className="bucket-head">
        <div className="bucket-label">{label}</div>
        <div className="bucket-sub">
          {bucket.count.toLocaleString()}{" "}
          {bucket.count === 1 ? "person" : "people"} · {sublabel}
          {locked && bucket.count > 0 && ` · ${need} more for stats`}
        </div>
      </div>

      <div className="pair-grid">
        <PairBar
          kicker="Personal choice"
          kickerHelp="what would you press?"
          cohort={bucket.personal}
          world={world.personal}
          locked={locked}
        />
        <PairBar
          kicker="Community recommendation"
          kickerHelp="what should everyone press?"
          cohort={bucket.community}
          world={world.community}
          locked={locked}
        />
        <PairBar
          kicker="For someone you love"
          kickerHelp="what would you tell a child to press?"
          cohort={bucket.dependent}
          world={world.dependent}
          locked={locked}
        />
        <PairBar
          kicker="Prediction"
          kickerHelp="what do you think most people will press?"
          cohort={bucket.expected}
          world={world.expected}
          locked={locked}
        />
      </div>
    </div>
  );
}

function PairBar({
  kicker,
  kickerHelp,
  cohort,
  world,
  locked,
}: {
  kicker: string;
  kickerHelp: string;
  cohort: CohortSplit | null;
  world: CohortSplit;
  locked: boolean;
}) {
  return (
    <div className={`pair-card${locked ? " pair-card--locked" : ""}`}>
      <div className="pair-head">
        <span className="pair-kicker">{kicker}</span>
        <span className="pair-help">{kickerHelp}</span>
      </div>
      <div className="pair-row">
        <div className="pair-side">Cohort</div>
        {locked || !cohort ? (
          <LockedBar />
        ) : (
          <ChoiceBar
            threshold={cohort.thresholdPercent}
            safe={cohort.safePercent}
          />
        )}
      </div>
      <div className="pair-row pair-row--world">
        <div className="pair-side">World</div>
        <ChoiceBar
          threshold={world.thresholdPercent}
          safe={world.safePercent}
          dimmed
        />
      </div>
    </div>
  );
}

function ChoiceBar({
  threshold,
  safe,
  dimmed,
}: {
  threshold: number;
  safe: number;
  dimmed?: boolean;
}) {
  return (
    <div
      className={`choice-bar${dimmed ? " choice-bar--dim" : ""}`}
      role="img"
      aria-label={`Threshold ${threshold.toFixed(1)} percent, Safe ${safe.toFixed(1)} percent`}
    >
      <span className="choice-fill choice-threshold" style={{ width: `${threshold}%` }}>
        {threshold >= 14 ? `${Math.round(threshold)}%` : ""}
      </span>
      <span className="choice-fill choice-safe" style={{ width: `${safe}%` }}>
        {safe >= 14 ? `${Math.round(safe)}%` : ""}
      </span>
    </div>
  );
}

function LockedBar() {
  return (
    <div className="choice-bar choice-bar--locked">
      <span className="choice-locked-text">— locked —</span>
    </div>
  );
}

/**
 * Unpublished /results state.
 *
 * Two paths from this screen:
 *  1. "Take the survey" — for new visitors who haven't responded yet.
 *  2. "Already responded?" email-link re-auth — for returning users who
 *     lost their preview cookie. They enter their email; we send a
 *     one-click link that, when followed, sets rb_preview and lands them
 *     here authenticated.
 *
 * If the user arrived via a failed claim (expired/missing/bad link), we
 * surface a small error banner above the form. Status is read from the
 * `?auth=` query param the /auth handler sets on failure.
 */
function Unpublished({ onUnlock: _onUnlock }: { onUnlock: () => void }) {
  type Step =
    | { kind: "intro" }
    | { kind: "email-form" }
    | { kind: "sent"; email: string };
  const [step, setStep] = useState<Step>({ kind: "intro" });
  const authError = readAuthErrorParam();

  return (
    <section className="results-coda">
      <h1>Results have not been published yet.</h1>
      <p className="results-coda-deck">
        We're still collecting answers. When the poll closes, the aggregate
        will be published here. Confirmed subscribers can see a live preview
        right now.
      </p>

      {authError && step.kind === "intro" && (
        <p className="error-text">{authErrorMessage(authError)}</p>
      )}

      {step.kind === "intro" && (
        <div className="unpublished-actions">
          <a className="share-twitter" href="/">Take the survey</a>
          <button
            type="button"
            className="share-copy"
            onClick={() => setStep({ kind: "email-form" })}
          >
            Already responded? Email me a link
          </button>
        </div>
      )}

      {step.kind === "email-form" && (
        <RequestLinkForm
          onSent={(email) => setStep({ kind: "sent", email })}
          onCancel={() => setStep({ kind: "intro" })}
        />
      )}

      {step.kind === "sent" && <LinkSentNotice email={step.email} />}
    </section>
  );
}

function RequestLinkForm({
  onSent,
  onCancel,
}: {
  onSent: (email: string) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    try {
      await sendPreviewLink({ email: email.trim() });
      onSent(email.trim());
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="unpublished-form" onSubmit={go}>
      <p className="unpublished-help">
        Enter the email you used. If we have a record of it, we'll send
        you a one-click link to your preview.
      </p>
      <input
        type="email"
        autoComplete="email"
        inputMode="email"
        spellCheck={false}
        required
        placeholder="you@example.com"
        aria-label="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoFocus
      />
      <div className="unpublished-actions">
        <button
          type="submit"
          className="share-twitter"
          disabled={pending || !email.includes("@")}
        >
          {pending ? "Sending…" : "Email me a link"}
        </button>
        <button type="button" className="share-copy" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {err && <p className="error-text">{err}</p>}
    </form>
  );
}

function LinkSentNotice({ email }: { email: string }) {
  return (
    <div className="unpublished-form">
      <p className="unpublished-help">
        If <strong>{email}</strong> is on file, a link is on its way —
        check your inbox. The link expires in 1 hour.
      </p>
    </div>
  );
}

/** Read the `?auth=...` query param the /auth handler sets on failures. */
function readAuthErrorParam(): string | null {
  if (typeof window === "undefined") return null;
  const v = new URL(window.location.href).searchParams.get("auth");
  return v && /^[a-z]+$/.test(v) ? v : null;
}
function authErrorMessage(code: string): string {
  switch (code) {
    case "expired":
      return "That link has expired or is no longer valid. Request a new one below.";
    case "missing":
      return "That link was incomplete. Request a new one below.";
    default:
      return "That link didn't work. Request a new one below.";
  }
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
