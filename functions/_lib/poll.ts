import type { PollStatus } from "../../shared/types";
import type { Env } from "./env";

export type PollSettings = {
  status: PollStatus;
  closesAt: string | null;
  resultsPublishedAt: string | null;
};

/**
 * Read poll settings. If a `closes_at` is set and has elapsed while the row
 * still says "open", we treat the poll as closed without writing to the DB —
 * the admin can flip it back open by clearing or resetting `closes_at`.
 */
export async function getPollSettings(env: Env): Promise<PollSettings> {
  const row = await env.DB.prepare(
    `SELECT status, closes_at AS closesAt,
            results_published_at AS resultsPublishedAt
     FROM poll_settings WHERE id = 1`,
  ).first<PollSettings>();
  if (!row) return { status: "open", closesAt: null, resultsPublishedAt: null };
  if (row.status === "open" && row.closesAt) {
    const closes = new Date(row.closesAt);
    if (!isNaN(closes.valueOf()) && closes <= new Date()) {
      return { ...row, status: "closed" };
    }
  }
  return row;
}

export async function getPollStatus(env: Env): Promise<PollStatus> {
  return (await getPollSettings(env)).status;
}

export async function setPollStatus(env: Env, status: PollStatus): Promise<void> {
  await env.DB.prepare(
    "UPDATE poll_settings SET status = ?, updated_at = datetime('now') WHERE id = 1",
  )
    .bind(status)
    .run();
}

export async function setPollClosesAt(
  env: Env,
  isoTimestamp: string | null,
): Promise<void> {
  await env.DB.prepare(
    "UPDATE poll_settings SET closes_at = ?, updated_at = datetime('now') WHERE id = 1",
  )
    .bind(isoTimestamp)
    .run();
}

/** Mark results published (idempotent) and force the poll closed. */
export async function publishResults(env: Env): Promise<string> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE poll_settings
     SET results_published_at = COALESCE(results_published_at, ?),
         status = 'closed',
         updated_at = datetime('now')
     WHERE id = 1`,
  )
    .bind(now)
    .run();
  const row = await env.DB.prepare(
    "SELECT results_published_at AS publishedAt FROM poll_settings WHERE id = 1",
  ).first<{ publishedAt: string }>();
  return row?.publishedAt ?? now;
}
