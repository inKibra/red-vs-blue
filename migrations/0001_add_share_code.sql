-- Add respondent share codes for cohort attribution.
-- Non-destructive: preserves all existing responses and leaves old code compatible.

ALTER TABLE responses ADD COLUMN share_code TEXT;

-- SQLite permits multiple NULLs in a UNIQUE index, so this is safe before backfill.
CREATE UNIQUE INDEX idx_responses_share_code ON responses(share_code);
CREATE INDEX idx_responses_referrer_id ON responses(referrer_id);
