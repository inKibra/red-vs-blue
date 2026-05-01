-- 0002: add unsubscribe support and case-study reveal timestamp.
--
-- Non-destructive forward migration. Safe to re-run via the IF NOT EXISTS
-- guards on indexes; SQLite's ALTER TABLE ADD COLUMN itself has no IF NOT
-- EXISTS, so this migration must be applied exactly once per environment.
--
-- After applying:
--   responses.unsubscribed_at        — set when the recipient clicks an
--                                      unsubscribe link or hits one-click
--                                      List-Unsubscribe. Future result and
--                                      preliminary sends MUST exclude any
--                                      row where this is non-null.
--   responses.preliminary_email_sent_at — guards admin/send-preliminary
--                                      idempotency, mirrors results_email_sent_at.
--   poll_settings.case_study_published_at — wall-clock moment the case study
--                                      went live. Lets later analysis split
--                                      pre-reveal vs post-reveal cohorts
--                                      (post-reveal respondents have seen
--                                      the by-frame breakdown and are
--                                      methodologically a different cohort).

ALTER TABLE responses ADD COLUMN unsubscribed_at TEXT;
ALTER TABLE responses ADD COLUMN preliminary_email_sent_at TEXT;

ALTER TABLE poll_settings ADD COLUMN case_study_published_at TEXT;

CREATE INDEX IF NOT EXISTS idx_responses_unsubscribed_at ON responses(unsubscribed_at);
