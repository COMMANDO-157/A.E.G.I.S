BEGIN;
CREATE TABLE IF NOT EXISTS rate_limits (
 bucket_hash text PRIMARY KEY CHECK(bucket_hash ~ '^[a-f0-9]{64}$'),
 hits integer NOT NULL CHECK(hits>0), reset_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_expiry_idx ON rate_limits(reset_at);
CREATE INDEX IF NOT EXISTS auth_challenges_expiry_idx ON auth_challenges(expires_at);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='complaints_payload_length') THEN
  ALTER TABLE complaints ADD CONSTRAINT complaints_payload_length CHECK(length(trim(description)) BETWEEN 20 AND 10000 AND length(department) BETWEEN 1 AND 120);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='reviews_payload_valid') THEN
  ALTER TABLE verification_reviews ADD CONSTRAINT reviews_payload_valid CHECK(length(notes)<=10000 AND decision IN ('Identity Verified','Evidence Pending','Under Review','Additional Information Requested','Findings Recorded','Resolved'));
 END IF;
END $$;
COMMIT;
