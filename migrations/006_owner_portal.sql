-- Owner entry state is separate from existing TOTP/action step-up tokens.
-- Reviewed locally only: applying this migration requires separate approval.
BEGIN;
-- Existing step-up code requires this field; applied migration 003 is immutable.
-- Legacy unbound tokens cannot satisfy a session-bound verification.
ALTER TABLE public.step_up_tokens ADD COLUMN IF NOT EXISTS session_hash text;
CREATE INDEX IF NOT EXISTS step_up_tokens_session_idx ON public.step_up_tokens(session_hash);
ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_failed_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_locked_until timestamptz;
CREATE TABLE IF NOT EXISTS owner_entry_challenges (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_hash text NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
 otp_hash text NOT NULL,
 setup boolean NOT NULL,
 pin_set_at timestamptz,
 expires_at timestamptz NOT NULL,
 used boolean NOT NULL DEFAULT false,
 delivered boolean NOT NULL DEFAULT false,
 UNIQUE(user_id, session_hash)
);
CREATE TABLE IF NOT EXISTS owner_portal_grants (
 token_hash text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_hash text NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
 pin_set_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 UNIQUE(user_id, session_hash)
);
CREATE INDEX IF NOT EXISTS owner_portal_grants_expiry_idx ON owner_portal_grants(expires_at);
REVOKE ALL ON TABLE public.owner_entry_challenges, public.owner_portal_grants FROM PUBLIC;
-- Only the existing production runtime role, if present. No credentials or owner creation.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aegis_app_runtime') THEN
  REVOKE ALL ON TABLE public.owner_entry_challenges, public.owner_portal_grants FROM aegis_app_runtime;
  GRANT SELECT, INSERT, UPDATE, DELETE ON owner_entry_challenges, owner_portal_grants TO aegis_app_runtime;
 END IF;
END $$;
COMMIT;
