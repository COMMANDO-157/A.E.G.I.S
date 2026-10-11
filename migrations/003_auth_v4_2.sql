-- A.E.G.I.S 4.0 — WP-4.2 Database Migration: Authentication, Primary Owner, MFA & Delegated Administration
-- Non-destructive, idempotent migration for Stage 4.2.
-- Preserves existing tables, constraints, triggers, and append-only audit log rules.

BEGIN;

-- 1. Extend users table for Primary Owner, MFA, and 5-digit Action PIN
DO $$ BEGIN
  -- Primary Owner flag
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='is_primary_owner') THEN
    ALTER TABLE users ADD COLUMN is_primary_owner boolean NOT NULL DEFAULT false;
  END IF;

  -- MFA status & encrypted TOTP secret (authenticated AES-256-GCM ciphertext + IV + auth tag)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='mfa_enrolled') THEN
    ALTER TABLE users ADD COLUMN mfa_enrolled boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='mfa_secret_encrypted') THEN
    ALTER TABLE users ADD COLUMN mfa_secret_encrypted text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='mfa_enrolled_at') THEN
    ALTER TABLE users ADD COLUMN mfa_enrolled_at timestamptz;
  END IF;

  -- 5-digit Action PIN (Salted scrypt hash + salt + security attempt tracking)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='action_pin_hash') THEN
    ALTER TABLE users ADD COLUMN action_pin_hash text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='action_pin_salt') THEN
    ALTER TABLE users ADD COLUMN action_pin_salt text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='action_pin_failed_attempts') THEN
    ALTER TABLE users ADD COLUMN action_pin_failed_attempts integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='action_pin_locked_until') THEN
    ALTER TABLE users ADD COLUMN action_pin_locked_until timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='action_pin_set_at') THEN
    ALTER TABLE users ADD COLUMN action_pin_set_at timestamptz;
  END IF;
END $$;

-- 2. Enforce exactly ONE active Primary Owner across the entire database via a partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS users_single_primary_owner_idx ON users (is_primary_owner) WHERE is_primary_owner = true;

-- 3. MFA Recovery Codes (SHA-256 hashed, single-use)
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, code_hash)
);

CREATE INDEX IF NOT EXISTS mfa_recovery_codes_user_idx ON mfa_recovery_codes(user_id) WHERE used = false;

-- 4. Delegated Administrative Permissions (Model A)
-- Supported permissions:
--   users.read, users.verify, users.roles.assign, users.suspend,
--   departments.manage, audit.read, authorities.assign
CREATE TABLE IF NOT EXISTS admin_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK(permission IN (
    'users.read',
    'users.verify',
    'users.roles.assign',
    'users.suspend',
    'departments.manage',
    'audit.read',
    'authorities.assign'
  )),
  granted_by uuid NOT NULL REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, permission)
);

CREATE INDEX IF NOT EXISTS admin_permissions_user_idx ON admin_permissions(user_id);

-- 5. Delegated Administrator Invitations
CREATE TABLE IF NOT EXISTS admin_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text UNIQUE NOT NULL,
  email text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]',
  invited_by uuid NOT NULL REFERENCES users(id),
  accepted_by uuid REFERENCES users(id),
  accepted_at timestamptz,
  revoked boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_invitations_token_idx ON admin_invitations(token_hash) WHERE accepted_at IS NULL AND revoked = false;

-- 6. Ephemeral Step-Up Verification States (Time-limited tokens for MFA / PIN authorization)
CREATE TABLE IF NOT EXISTS step_up_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK(purpose IN ('mfa_step_up', 'pin_step_up', 'admin_step_up')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS step_up_tokens_expiry_idx ON step_up_tokens(expires_at);

COMMIT;
