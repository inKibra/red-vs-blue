import { useEffect, useState } from "react";
import type {
  ChoiceTotals,
  CrossTabRow,
  GroupRow,
  ResultsResponse,
} from "@shared/types";
import {
  adminEndPoll,
  adminLogin,
  adminLogout,
  adminReopenPoll,
  adminResults,
  adminSession,
  adminPublishResults,
  adminSetClose,
  getStatus,
} from "./api";

export function Admin() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    adminSession()
      .then((s) => setAuthed(s.authenticated))
      .catch(() => setAuthed(false));
  }, []);

  return (
    <div className="admin">
      {authed === null ? (
        <div className="container">
          <p className="muted">Loading…</p>
        </div>
      ) : !authed ? (
        <Login onSuccess={() => setAuthed(true)} />
      ) : (
        <Dashboard onLogout={() => setAuthed(false)} />
      )}
    </div>
  );
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await adminLogin(password);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Admin login</h1>
        <form onSubmit={submit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
          />
          <div className="row" style={{ marginTop: 12 }}>
            <button type="submit" className="primary" disabled={pending}>
              {pending ? "Signing in..." : "Sign in"}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<ResultsResponse | null>(null);
  const [closesAt, setClosesAt] = useState<string | null>(null);
  const [resultsPublishedAt, setResultsPublishedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [results, status] = await Promise.all([adminResults(), getStatus()]);
      setData(results);
      setClosesAt(status.closesAt);
      setResultsPublishedAt(status.resultsPublishedAt);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function setCloseTime(localValue: string | null) {
    setBusy(true);
    try {
      const iso = localValue ? new Date(localValue).toISOString() : null;
      const res = await adminSetClose(iso);
      setClosesAt(res.closesAt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function publishResults() {
    if (!confirm("Publish results now? This closes the poll, makes /results public, and emails verified subscribers.")) {
      return;
    }
    setBusy(true);
    try {
      const res = await adminPublishResults();
      setResultsPublishedAt(res.publishedAt);
      await refresh();
      alert(`Published. ${res.notifiedSubscribers} email(s) sent. ${res.failedSubscribers} failed.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, []);

  async function endPoll() {
    if (!confirm("End the poll? Public visitors will no longer be able to respond."))
      return;
    setBusy(true);
    try {
      await adminEndPoll();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reopenPoll() {
    setBusy(true);
    try {
      await adminReopenPoll();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await adminLogout();
    onLogout();
  }

  if (!data && !error) {
    return (
      <div className="container wide">
        <p className="muted">Loading results...</p>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="container wide">
        <div className="card">
          <p className="error">{error}</p>
        </div>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="container wide">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0 }}>Admin dashboard</h1>
            <div className="row" style={{ marginTop: 8 }}>
              <span className={`pill ${data.status === "open" ? "open" : "closed"}`}>
                {data.status}
              </span>
              <span className="muted">{data.totalResponses} responses</span>
              {resultsPublishedAt && (
                <span className="pill" style={{ borderColor: "var(--accent-dark)", color: "var(--accent-dark)" }}>
                  results published
                </span>
              )}
            </div>
          </div>
          <div className="row">
            {data.status === "open" ? (
              <button className="danger" onClick={endPoll} disabled={busy}>
                End poll
              </button>
            ) : (
              <button className="ghost" onClick={reopenPoll} disabled={busy}>
                Reopen poll
              </button>
            )}
            {!resultsPublishedAt && (
              <button className="primary" onClick={publishResults} disabled={busy}>
                Publish results
              </button>
            )}
            <a className="ghost" href="/api/admin/export.csv" download>
              Export CSV
            </a>
            <button className="ghost" onClick={refresh}>
              Refresh
            </button>
            <button className="ghost" onClick={logout}>
              Log out
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      )}

      <CloseTimeCard closesAt={closesAt} busy={busy} onSet={setCloseTime} />

      <div className="grid-2">
        <OverallCard data={data} />
        <ConfidenceCard avg={data.overall.averageConfidence} />
      </div>

      <GroupTable
        title="Personal choice by frame"
        rows={data.byFrame}
        keyHeader="Frame"
      />
      <GroupTable
        title="By children/infirm salience"
        rows={data.bySalience}
        keyHeader="Salience"
      />
      <GroupTable
        title="By label condition"
        rows={data.byLabelCondition}
        keyHeader="Labels"
      />
      <GroupTable
        title="By clause order"
        rows={data.byOrderCondition}
        keyHeader="Order"
      />

      <CrossTab
        title="Personal vs public recommendation"
        rows={data.crossTabs.personalVsPublic}
      />
      <CrossTab
        title="Personal vs child/dependent recommendation"
        rows={data.crossTabs.personalVsDependent}
      />
    </div>
  );
}

function OverallCard({ data }: { data: ResultsResponse }) {
  const o = data.overall;
  return (
    <div className="card">
      <h2>Overall</h2>
      <ChoiceBar label="Personal choice" totals={o.personalChoice} />
      <ChoiceBar label="Public recommendation" totals={o.publicRecommendation} />
      <ChoiceBar label="Dependent recommendation" totals={o.dependentRecommendation} />
      <ChoiceBar label="Expected majority" totals={o.expectedMajority} />
    </div>
  );
}

function ConfidenceCard({ avg }: { avg: number }) {
  return (
    <div className="card">
      <h2>Average confidence</h2>
      <p style={{ fontSize: 36, margin: 0 }}>{avg.toFixed(2)}</p>
      <p className="muted">Scale 1 (not confident) – 5 (extremely confident).</p>
    </div>
  );
}

function ChoiceBar({ label, totals }: { label: string; totals: ChoiceTotals }) {
  const n = totals.threshold + totals.safe;
  const tPct = n === 0 ? 0 : (totals.threshold / n) * 100;
  const sPct = n === 0 ? 0 : (totals.safe / n) * 100;
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span className="muted">n = {n}</span>
      </div>
      <div className="bar" title={`threshold ${tPct.toFixed(1)}% / safe ${sPct.toFixed(1)}%`}>
        <span className="b-threshold" style={{ width: `${tPct}%` }}>
          {tPct >= 8 ? `${tPct.toFixed(0)}%` : ""}
        </span>
        <span className="b-safe" style={{ width: `${sPct}%` }}>
          {sPct >= 8 ? `${sPct.toFixed(0)}%` : ""}
        </span>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        threshold {totals.threshold} · safe {totals.safe}
      </div>
    </div>
  );
}

function GroupTable<K extends string>({
  title,
  rows,
  keyHeader,
}: {
  title: string;
  rows: GroupRow<K>[];
  keyHeader: string;
}) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>{keyHeader}</th>
            <th>N</th>
            <th>Personal threshold %</th>
            <th>Public threshold %</th>
            <th>Dependent threshold %</th>
            <th>Avg confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.key}</td>
              <td>{r.n}</td>
              <td>{thresholdPct(r.personalChoice)}</td>
              <td>{thresholdPct(r.publicRecommendation)}</td>
              <td>{thresholdPct(r.dependentRecommendation)}</td>
              <td>{r.n === 0 ? "—" : r.averageConfidence.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function thresholdPct(t: ChoiceTotals): string {
  const n = t.threshold + t.safe;
  if (n === 0) return "—";
  return `${((t.threshold / n) * 100).toFixed(1)}%`;
}

function CrossTab({ title, rows }: { title: string; rows: CrossTabRow[] }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>Pattern</th>
            <th>Count</th>
            <th>Percent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.pattern}>
              <td>{r.pattern}</td>
              <td>{r.count}</td>
              <td>{r.percent}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


function CloseTimeCard({
  closesAt,
  busy,
  onSet,
}: {
  closesAt: string | null;
  busy: boolean;
  onSet: (localValue: string | null) => void;
}) {
  const [draft, setDraft] = useState("");

  // Pre-fill the input with the current scheduled close, in the local-time
  // format <input type="datetime-local"> wants.
  useEffect(() => {
    if (!closesAt) {
      setDraft("");
      return;
    }
    const d = new Date(closesAt);
    if (isNaN(d.valueOf())) {
      setDraft("");
      return;
    }
    setDraft(toLocalDatetimeInput(d));
  }, [closesAt]);

  return (
    <div className="card">
      <h2>Scheduled close</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Set a future timestamp. The poll will auto-close at that moment;
        participants see a live countdown until then.
      </p>
      <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
        <input
          type="datetime-local"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ padding: "10px 12px", border: "1px solid var(--rule-strong)", background: "var(--panel-3)", color: "var(--ink)", fontFamily: "inherit", fontSize: "14px" }}
        />
        <button
          className="primary"
          disabled={busy || !draft}
          onClick={() => onSet(draft || null)}
        >
          Set close time
        </button>
        {closesAt && (
          <button className="ghost" disabled={busy} onClick={() => onSet(null)}>
            Clear
          </button>
        )}
      </div>
      {closesAt && (
        <p className="muted" style={{ marginTop: 12 }}>
          Currently set to {new Date(closesAt).toLocaleString()}.
        </p>
      )}
    </div>
  );
}

function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}