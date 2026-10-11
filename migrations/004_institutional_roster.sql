-- A.E.G.I.S 4.0 — Migration 004: Canonical Departments, Authoritative Student Rosters,
-- Verification Requests, Authority Assignments, and Ingestion Conflicts
-- Non-destructive, idempotent, forward-compatible schema upgrade.

BEGIN;

-- 1. Canonical Institutional Departments Master Table
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL CHECK(code ~ '^[A-Z0-9_-]{2,20}$'),
  name text UNIQUE NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 120),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS departments_active_idx ON departments(code) WHERE active = true;

-- Seed canonical academic departments
INSERT INTO departments (code, name) VALUES
  ('CSE', 'Computer Science and Engineering'),
  ('IT', 'Information Technology'),
  ('ECE', 'Electronics and Communication Engineering'),
  ('EEE', 'Electrical and Electronics Engineering'),
  ('MECH', 'Mechanical Engineering'),
  ('CIVIL', 'Civil Engineering'),
  ('AIDS', 'Artificial Intelligence and Data Science')
ON CONFLICT (code) DO NOTHING;

-- 2. Authoritative Student Rosters (Master Record for Register Numbers)
CREATE TABLE IF NOT EXISTS student_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  register_number text UNIQUE NOT NULL CHECK(register_number ~ '^[A-Za-z0-9]{6,30}$'),
  institutional_email text UNIQUE NOT NULL CHECK(institutional_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  full_name text NOT NULL CHECK(length(trim(full_name)) BETWEEN 2 AND 150),
  department_code text NOT NULL REFERENCES departments(code) ON UPDATE CASCADE,
  batch_year text NOT NULL CHECK(batch_year ~ '^\d{4}(-\d{4})?$'),
  degree_program text NOT NULL DEFAULT 'B.Tech' CHECK(length(trim(degree_program)) BETWEEN 2 AND 80),
  -- 1:1 binding between verified Google user account and authoritative roster row
  bound_user_id uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_rosters_dept_batch_idx ON student_rosters(department_code, batch_year);
CREATE INDEX IF NOT EXISTS student_rosters_bound_user_idx ON student_rosters(bound_user_id) WHERE bound_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS student_rosters_email_idx ON student_rosters(institutional_email);

-- 3. Student Verification Requests (Audited 7-Day State Machine)
CREATE TABLE IF NOT EXISTS student_verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  roster_id uuid NOT NULL REFERENCES student_rosters(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  claim_channel text NOT NULL CHECK(claim_channel IN ('INSTITUTIONAL_OAUTH_EXACT', 'STUDENT_MANUAL_CLAIM', 'ADMIN_MANUAL_PROVISION')),
  notes text CHECK(notes IS NULL OR length(trim(notes)) <= 2000),
  rejection_reason text CHECK(rejection_reason IS NULL OR length(trim(rejection_reason)) <= 1000),
  identity_evidence_reference text CHECK(identity_evidence_reference IS NULL OR length(trim(identity_evidence_reference)) <= 500),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- At most ONE active PENDING request per user and per target roster entry
CREATE UNIQUE INDEX IF NOT EXISTS student_verif_pending_user_idx 
  ON student_verification_requests(user_id) 
  WHERE status = 'PENDING';

CREATE UNIQUE INDEX IF NOT EXISTS student_verif_pending_roster_idx 
  ON student_verification_requests(roster_id) 
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS student_verif_status_idx ON student_verification_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS student_verif_expires_idx ON student_verification_requests(expires_at) WHERE status = 'PENDING';

-- 4. Institutional Authority Assignments (Multi-Department Appointments)
CREATE TABLE IF NOT EXISTS authority_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('HOD', 'Dean', 'Higher Authority')),
  department_code text NOT NULL REFERENCES departments(code) ON UPDATE CASCADE,
  assigned_by uuid NOT NULL REFERENCES users(id),
  active boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  UNIQUE(user_id, department_code, role)
);

CREATE INDEX IF NOT EXISTS authority_assignments_active_lookup_idx 
  ON authority_assignments(user_id, role, department_code) 
  WHERE active = true;

-- 5. Roster Ingestion Quarantined Conflicts Ledger
CREATE TABLE IF NOT EXISTS roster_import_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  register_number text NOT NULL,
  institutional_email text NOT NULL,
  department_code text NOT NULL,
  conflict_type text NOT NULL CHECK(conflict_type IN (
    'REGISTER_EXISTS_MISMATCH',
    'EMAIL_EXISTS_MISMATCH',
    'DEPARTMENT_INVALID',
    'ACTIVE_BINDING_CONFLICT'
  )),
  raw_payload jsonb NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  resolution_action text CHECK(resolution_action IN ('ACCEPTED_UPDATE', 'DISCARDED', 'MANUAL_EDIT_APPLIED')),
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS roster_conflicts_batch_idx ON roster_import_conflicts(batch_id, resolved);
CREATE INDEX IF NOT EXISTS roster_conflicts_unresolved_idx ON roster_import_conflicts(created_at DESC) WHERE resolved = false;

-- 6. Non-Destructive Extension of Users Table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='is_verified_student') THEN
    ALTER TABLE users ADD COLUMN is_verified_student boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='roster_id') THEN
    ALTER TABLE users ADD COLUMN roster_id uuid UNIQUE REFERENCES student_rosters(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='department_code') THEN
    ALTER TABLE users ADD COLUMN department_code text REFERENCES departments(code) ON UPDATE CASCADE;
  END IF;
END $$;

-- 7. Update Delegated Administrative Permissions Constraint in admin_permissions
-- Preserves ALL 7 existing permissions while safely appending the 3 new institutional permissions
DO $$ BEGIN
  ALTER TABLE admin_permissions DROP CONSTRAINT IF EXISTS admin_permissions_permission_check;
  ALTER TABLE admin_permissions ADD CONSTRAINT admin_permissions_permission_check CHECK (permission IN (
    'users.read',
    'users.verify',
    'users.roles.assign',
    'users.suspend',
    'departments.manage',
    'audit.read',
    'authorities.assign',
    'roster.import',
    'roster.conflicts.manage',
    'department.students.verify'
  ));
END $$;

-- 8. Grant Application Runtime Role Access to New Tables (if role exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aegis_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON departments, student_rosters, student_verification_requests, authority_assignments, roster_import_conflicts TO aegis_runtime;
  END IF;
END $$;

COMMIT;
