-- PROPOSAL ONLY. Not in migrations/ and not discovered by the migration runner.
-- Dedicated Student Services Schema (Routine services strictly isolated from confidential grievances and well-being)
-- G11 STRICT HOLD: Requires institutional policy approval before deployment to shared or production environments.

BEGIN;

-- 1. Student Services Catalog (Institutional catalogue of available routine support services)
CREATE TABLE IF NOT EXISTS student_services_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  department_code text REFERENCES departments(code) ON DELETE RESTRICT,
  service_code text NOT NULL CHECK(service_code ~ '^[a-z0-9_-]{2,50}$'),
  category text NOT NULL CHECK(category IN ('academic', 'accessibility', 'financial', 'administrative', 'facilities')),
  title text NOT NULL CHECK(length(trim(title)) BETWEEN 3 AND 200),
  description text NOT NULL CHECK(length(trim(description)) BETWEEN 5 AND 2000),
  active boolean NOT NULL DEFAULT true,
  sla_hours integer NOT NULL DEFAULT 72 CHECK(sla_hours BETWEEN 1 AND 720),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(institution_id, service_code)
);

CREATE INDEX IF NOT EXISTS student_services_catalog_inst_idx ON student_services_catalog(institution_id, active);
CREATE INDEX IF NOT EXISTS student_services_catalog_dept_idx ON student_services_catalog(department_code) WHERE department_code IS NOT NULL;

-- 2. Student Service Requests (Routine operational service lifecycle)
-- Invariants:
-- - Belongs to a verified student user and authoritative institution
-- - Department scoped
-- - Strict legal state transitions: requested -> acknowledged -> in_progress -> completed / cancelled
-- - Optimistic concurrency version column
-- - Zero confidential grievance fields, zero clinical notes, zero well-being intake
CREATE TABLE IF NOT EXISTS student_service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number text UNIQUE NOT NULL CHECK(reference_number ~ '^SR-[0-9]{4}-[A-Z0-9]{6,12}$'),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  department_code text NOT NULL REFERENCES departments(code) ON DELETE RESTRICT,
  service_id uuid NOT NULL REFERENCES student_services_catalog(id) ON DELETE RESTRICT,
  student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_staff_id uuid REFERENCES users(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'requested' CHECK(state IN ('requested', 'acknowledged', 'in_progress', 'completed', 'cancelled')),
  subject text NOT NULL CHECK(length(trim(subject)) BETWEEN 3 AND 200),
  details text NOT NULL CHECK(length(trim(details)) BETWEEN 10 AND 5000),
  version integer NOT NULL DEFAULT 1 CHECK(version >= 1),
  resolution_notes text CHECK(resolution_notes IS NULL OR length(trim(resolution_notes)) BETWEEN 5 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);

-- Partial unique index to enforce idempotency / duplicate open request denial per student & service
CREATE UNIQUE INDEX IF NOT EXISTS student_services_single_open_request_idx
  ON student_service_requests(student_user_id, service_id)
  WHERE state IN ('requested', 'acknowledged', 'in_progress');

CREATE INDEX IF NOT EXISTS student_services_student_idx ON student_service_requests(student_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS student_services_institution_dept_idx ON student_service_requests(institution_id, department_code, state);
CREATE INDEX IF NOT EXISTS student_services_staff_idx ON student_service_requests(assigned_staff_id, state) WHERE assigned_staff_id IS NOT NULL;

-- 3. Dedicated Student Services Audit Logs
-- Append-only audit records isolated from general and grievance audit logs
CREATE TABLE IF NOT EXISTS student_services_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES student_service_requests(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK(action IN ('CREATED', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'UPDATED')),
  from_state text CHECK(from_state IS NULL OR from_state IN ('requested', 'acknowledged', 'in_progress', 'completed', 'cancelled')),
  to_state text NOT NULL CHECK(to_state IN ('requested', 'acknowledged', 'in_progress', 'completed', 'cancelled')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_services_audit_request_idx ON student_services_audit_logs(request_id, timestamp);
CREATE INDEX IF NOT EXISTS student_services_audit_actor_idx ON student_services_audit_logs(actor_id, timestamp);

-- Enforce append-only trigger on student_services_audit_logs
CREATE OR REPLACE FUNCTION deny_student_services_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Student services audit records are strictly append-only';
END;
$$;

DROP TRIGGER IF EXISTS student_services_audit_append_only ON student_services_audit_logs;
CREATE TRIGGER student_services_audit_append_only
  BEFORE UPDATE OR DELETE ON student_services_audit_logs
  FOR EACH ROW EXECUTE FUNCTION deny_student_services_audit_mutation();

COMMIT;
