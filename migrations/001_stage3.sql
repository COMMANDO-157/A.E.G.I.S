BEGIN;
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), google_subject_id text UNIQUE NOT NULL,
 email text NOT NULL, name text NOT NULL, department text NOT NULL DEFAULT '',
 role text NOT NULL DEFAULT 'student' CHECK (role IN ('student','HOD','Dean','Higher Authority','admin')),
 account_status text NOT NULL DEFAULT 'active' CHECK(account_status IN ('active','suspended')),
 staff_requested boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS complaints (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference_id text UNIQUE NOT NULL,
 owner_user_id uuid NOT NULL REFERENCES users(id), case_id uuid NOT NULL,
 department text NOT NULL, category text NOT NULL, description text NOT NULL,
 identity_mode text NOT NULL DEFAULT 'anonymous' CHECK(identity_mode IN ('anonymous','confidential','standard')),
 severity text NOT NULL CHECK(severity IN ('Low','Moderate','Critical')),
 urgency text NOT NULL CHECK(urgency IN ('Routine','Urgent','Immediate Danger')),
 assigned_authority text NOT NULL CHECK(assigned_authority IN ('HOD','Dean','Higher Authority')),
 status text NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Escalated','In Review','Under Investigation','Action Taken','Resolved')),
 verification_status text NOT NULL DEFAULT 'Submitted' CHECK(verification_status IN ('Submitted','Identity Verified','Evidence Pending','Under Review','Additional Information Requested','Findings Recorded','Resolved')),
 identity_status text NOT NULL DEFAULT 'Google Verified',
 evidence_status text NOT NULL DEFAULT 'Pending' CHECK(evidence_status IN ('Pending','Authenticity Confirmed','Inconclusive')),
 allegation_status text NOT NULL DEFAULT 'Unreviewed' CHECK(allegation_status IN ('Unreviewed','Substantiated','Not Substantiated','Inconclusive')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,case_id)
);
CREATE TABLE IF NOT EXISTS complaint_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), complaint_id uuid NOT NULL REFERENCES complaints(id),
 uploaded_by uuid NOT NULL REFERENCES users(id), file_reference text NOT NULL CHECK(file_reference LIKE 'private/%'),
 evidence_status text NOT NULL DEFAULT 'Pending' CHECK(evidence_status IN ('Pending','Authenticity Confirmed','Inconclusive')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS case_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL, complaint_id uuid UNIQUE NOT NULL,
 FOREIGN KEY(complaint_id,case_id) REFERENCES complaints(id,case_id)
);
CREATE TABLE IF NOT EXISTS verification_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), complaint_id uuid NOT NULL REFERENCES complaints(id),
 reviewer_id uuid NOT NULL REFERENCES users(id), decision text NOT NULL, notes text NOT NULL CHECK(length(trim(notes))>=15),
 reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id),
 complaint_id uuid REFERENCES complaints(id), action text NOT NULL, details jsonb NOT NULL DEFAULT '{}',
 timestamp timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_challenges (token_hash text PRIMARY KEY, expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS complaints_owner_idx ON complaints(owner_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS complaints_case_idx ON complaints(case_id);
CREATE INDEX IF NOT EXISTS complaints_authority_idx ON complaints(assigned_authority,department);
CREATE INDEX IF NOT EXISTS audit_complaint_idx ON audit_logs(complaint_id,timestamp);
CREATE INDEX IF NOT EXISTS reviews_complaint_idx ON verification_reviews(complaint_id,reviewed_at);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS evidence_complaint_idx ON complaint_evidence(complaint_id);
CREATE OR REPLACE FUNCTION deny_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit records are append-only'; END; $$;
DROP TRIGGER IF EXISTS audit_append_only ON audit_logs;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
COMMIT;
