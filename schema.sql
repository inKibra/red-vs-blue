-- D1 schema for the Threshold Study.
-- Run from a clean state:
--   wrangler d1 execute red-vs-blue --local  --file=./schema.sql
--   wrangler d1 execute red-vs-blue --remote --file=./schema.sql
--
-- This schema is destructive. There are no migrations yet; the project has
-- no production data. When that changes, replace these DROPs with a proper
-- migration sequence.

DROP TABLE IF EXISTS responses;
DROP TABLE IF EXISTS poll_settings;
DROP TABLE IF EXISTS dev_emails;

CREATE TABLE poll_settings (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  status                TEXT NOT NULL CHECK (status IN ('open','closed')),
  closes_at             TEXT,
  results_published_at  TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

INSERT INTO poll_settings (id, status, created_at, updated_at)
VALUES (1, 'open', datetime('now'), datetime('now'));

CREATE TABLE responses (
  id                          TEXT PRIMARY KEY,
  token_id                    TEXT NOT NULL UNIQUE,
  created_at                  TEXT NOT NULL,
  updated_at                  TEXT NOT NULL,
  submitted_at                TEXT,

  mechanism_frame             TEXT NOT NULL,
  salience_condition          TEXT NOT NULL,
  label_condition             TEXT NOT NULL,
  order_condition             TEXT NOT NULL,
  displayed_threshold_label   TEXT NOT NULL,
  displayed_safe_label        TEXT NOT NULL,

  personal_choice             TEXT CHECK (personal_choice IN ('threshold','safe')),
  public_recommendation       TEXT CHECK (public_recommendation IN ('threshold','safe')),
  dependent_recommendation    TEXT CHECK (dependent_recommendation IN ('threshold','safe')),
  expected_majority           TEXT CHECK (expected_majority IN ('threshold','safe')),
  confidence                  INTEGER CHECK (confidence BETWEEN 1 AND 5),
  reason_text                 TEXT,

  email                       TEXT,
  email_verified_at           TEXT,
  /** True once the published-results notification has been queued for this row. */
  results_email_sent_at       TEXT,
  otc_hash                    TEXT,
  otc_expires_at              TEXT,
  otc_attempts                INTEGER NOT NULL DEFAULT 0,

  user_agent_hash             TEXT,
  ip_hash                     TEXT,

  -- Referrer / campaign attribution. Captured from URL params on first
  -- assignment and persisted via the signed token so they survive across
  -- the per-click partial saves. All optional / nullable.
  utm_source                  TEXT,   -- e.g. "twitter", "hn"
  utm_medium                  TEXT,   -- e.g. "share", "email"
  utm_campaign                TEXT,   -- e.g. "launch", "waitbutwhy_repost"
  utm_content                 TEXT,   -- e.g. tweet id, ad creative
  utm_term                    TEXT,   -- e.g. paid keyword (rare for us)
  referrer_id                 TEXT,   -- ad-hoc ?ref= value, e.g. "waitbutwhy"
  referer_url                 TEXT,   -- raw HTTP Referer header on first hit
  share_code                  TEXT    -- respondent's public cohort attribution code
);

CREATE INDEX idx_responses_submitted_at ON responses(submitted_at);
CREATE INDEX idx_responses_created_at   ON responses(created_at);
CREATE INDEX idx_responses_frame        ON responses(mechanism_frame);
CREATE INDEX idx_responses_salience     ON responses(salience_condition);
CREATE INDEX idx_responses_label        ON responses(label_condition);
CREATE INDEX idx_responses_order        ON responses(order_condition);

CREATE UNIQUE INDEX idx_responses_share_code ON responses(share_code);
CREATE INDEX idx_responses_referrer_id      ON responses(referrer_id);
-- Dev-mode email outbox: when EMAIL_FROM_ADDRESS is unset, the sender stashes
-- rendered emails here so they can be viewed at /dev/email/:id without DNS.
CREATE TABLE dev_emails (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  to_addr     TEXT NOT NULL,
  subject     TEXT NOT NULL,
  html        TEXT NOT NULL,
  text        TEXT NOT NULL
);
CREATE INDEX idx_dev_emails_created_at ON dev_emails(created_at);
