-- A.E.G.I.S 4.0 — Migration 007: Hybrid Institutional Student Verification & Institution Governance
-- Non-destructive, additive, idempotent schema upgrade for G09.1.

BEGIN;

-- 1. Institution Entity Master Table
CREATE TABLE IF NOT EXISTS institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL CHECK(slug ~ '^[a-z0-9_-]{2,50}$'),
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 200),
  active boolean NOT NULL DEFAULT true,
  domains text[] NOT NULL DEFAULT '{}',
  supported_methods text[] NOT NULL DEFAULT '{"INSTITUTIONAL_EMAIL", "PERSONAL_GOOGLE_ROSTER"}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS institutions_active_idx ON institutions(slug) WHERE active = true;

-- Seed Default Anchor Institution
INSERT INTO institutions (slug, name, active, domains, supported_methods)
VALUES (
  'default',
  'Autonomous College of Engineering and Technology',
  true,
  ARRAY['college.edu.in', 'autocoll.ac.in'],
  ARRAY['INSTITUTIONAL_EMAIL', 'PERSONAL_GOOGLE_ROSTER']
)
ON CONFLICT (slug) DO NOTHING;

-- 2. Add institution_id to departments, student_rosters, and verification_requests (Additive)
DO $$
DECLARE
  v_default_id uuid;
BEGIN
  SELECT id INTO v_default_id FROM institutions WHERE slug = 'default';

  -- departments
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='departments' AND column_name='institution_id') THEN
    ALTER TABLE departments ADD COLUMN institution_id uuid REFERENCES institutions(id) ON DELETE RESTRICT;
    UPDATE departments SET institution_id = v_default_id WHERE institution_id IS NULL;
    ALTER TABLE departments ALTER COLUMN institution_id SET NOT NULL;
  END IF;

  -- student_rosters
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_rosters' AND column_name='institution_id') THEN
    ALTER TABLE student_rosters ADD COLUMN institution_id uuid REFERENCES institutions(id) ON DELETE RESTRICT;
    UPDATE student_rosters SET institution_id = v_default_id WHERE institution_id IS NULL;
    ALTER TABLE student_rosters ALTER COLUMN institution_id SET NOT NULL;
  END IF;

  -- student_rosters optional approved personal email and test record flag
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_rosters' AND column_name='approved_personal_email') THEN
    ALTER TABLE student_rosters ADD COLUMN approved_personal_email text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_rosters' AND column_name='is_test_record') THEN
    ALTER TABLE student_rosters ADD COLUMN is_test_record boolean NOT NULL DEFAULT false;
  END IF;

  -- student_verification_requests
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_verification_requests' AND column_name='institution_id') THEN
    ALTER TABLE student_verification_requests ADD COLUMN institution_id uuid REFERENCES institutions(id) ON DELETE RESTRICT;
    UPDATE student_verification_requests SET institution_id = v_default_id WHERE institution_id IS NULL;
    ALTER TABLE student_verification_requests ALTER COLUMN institution_id SET NOT NULL;
  END IF;

  -- Update student_verification_requests claim_channel check constraint
  ALTER TABLE student_verification_requests DROP CONSTRAINT IF EXISTS student_verification_requests_claim_channel_check;
  ALTER TABLE student_verification_requests ADD CONSTRAINT student_verification_requests_claim_channel_check CHECK (
    claim_channel IN (
      'INSTITUTIONAL_OAUTH_EXACT',
      'PERSONAL_GOOGLE_ROSTER',
      'STUDENT_MANUAL_CLAIM',
      'ADMIN_MANUAL_PROVISION'
    )
  );

  -- Verification methods enum / audit column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_verification_requests' AND column_name='verification_method') THEN
    ALTER TABLE student_verification_requests ADD COLUMN verification_method text;
  END IF;
END $$;

-- 3. Composite index for multi-institution support
CREATE INDEX IF NOT EXISTS student_rosters_inst_reg_idx ON student_rosters(institution_id, register_number);
CREATE INDEX IF NOT EXISTS student_rosters_inst_email_idx ON student_rosters(institution_id, institutional_email);

-- 4. Application Runtime Role Access
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aegis_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON institutions TO aegis_runtime;
  END IF;
END $$;

COMMIT;
