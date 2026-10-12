-- A.E.G.I.S 4.0 — Migration 005: Dual Authentication (Password & Account Linking) & Password Reset
-- Non-destructive, strict least-privilege compatible. Rollback after password-only
-- accounts exist requires a reviewed data-preserving recovery plan.
-- Preserves existing tables, constraints, triggers, and append-only audit log rules.

BEGIN;

-- 1. Make google_subject_id NULLABLE in users to support username/email + password accounts
ALTER TABLE users ALTER COLUMN google_subject_id DROP NOT NULL;

-- 2. Add password hashing columns and account linking verification fields
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password_hash') THEN
    ALTER TABLE users ADD COLUMN password_hash text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password_salt') THEN
    ALTER TABLE users ADD COLUMN password_salt text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password_failed_attempts') THEN
    ALTER TABLE users ADD COLUMN password_failed_attempts integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password_locked_until') THEN
    ALTER TABLE users ADD COLUMN password_locked_until timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password_set_at') THEN
    ALTER TABLE users ADD COLUMN password_set_at timestamptz;
  END IF;
END $$;

-- 3. Unique email index (lower-cased) to ensure one account per institutional email
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

-- 4. Password reset tokens table (Single-use, expiring, hashed token)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  used boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_lookup_idx ON password_reset_tokens(token_hash) WHERE used = false;

-- Ephemeral reset state requires DML and TTL cleanup, never DDL or TRUNCATE.
-- Scoped to this new table; do not run the full provisioning script before 006.
REVOKE ALL ON TABLE public.password_reset_tokens FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aegis_app_runtime') THEN
    REVOKE ALL ON TABLE public.password_reset_tokens FROM aegis_app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.password_reset_tokens TO aegis_app_runtime;
  END IF;
END $$;

COMMIT;
