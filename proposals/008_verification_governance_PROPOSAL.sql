-- PROPOSAL ONLY. Not in migrations/ and not discovered by the migration runner.
-- Requires institutional approval of appointment/clearance custody and deployment grants.
-- No roles, grants, appointments, clearances or retention rules are created here.
BEGIN;
CREATE TABLE verification_officer_appointments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 officer_user_id uuid NOT NULL REFERENCES users(id),
 institution_id uuid NOT NULL REFERENCES institutions(id),
 department_code text NOT NULL REFERENCES departments(code),
 cohort text NOT NULL CHECK(length(trim(cohort)) BETWEEN 1 AND 40 AND cohort<>'*'),
 starts_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL CHECK(expires_at>starts_at),
 revoked_at timestamptz,
 appointed_by uuid NOT NULL REFERENCES users(id),
 appointment_reference text NOT NULL CHECK(length(trim(appointment_reference)) BETWEEN 5 AND 500),
 CHECK(appointed_by<>officer_user_id)
);
CREATE INDEX verification_officer_actor_idx ON verification_officer_appointments(officer_user_id);
CREATE TABLE verification_conflict_clearances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 appointment_id uuid NOT NULL REFERENCES verification_officer_appointments(id),
 request_id uuid NOT NULL REFERENCES student_verification_requests(id),
 status text NOT NULL CHECK(status IN ('UNKNOWN','CLEARED','CONFLICT')),
 starts_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL CHECK(expires_at>starts_at),
 revoked_at timestamptz,
 recorded_by uuid NOT NULL REFERENCES users(id),
 clearance_reference text NOT NULL CHECK(length(trim(clearance_reference)) BETWEEN 5 AND 500),
 UNIQUE(appointment_id,request_id)
);
-- Serialize decisions with all operator-side appointment/clearance changes.
-- These trigger functions do not elevate privileges or grant runtime table writes.
CREATE FUNCTION verification_appointment_change_lock() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $governance$
DECLARE actor uuid;
BEGIN
 FOR actor IN SELECT DISTINCT x FROM unnest(ARRAY[CASE WHEN TG_OP<>'INSERT' THEN OLD.officer_user_id END, CASE WHEN TG_OP<>'DELETE' THEN NEW.officer_user_id END]) x WHERE x IS NOT NULL ORDER BY x LOOP
  PERFORM pg_advisory_xact_lock(hashtext('verification-authority:'||actor::text));
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $governance$;
CREATE TRIGGER verification_appointment_change_lock BEFORE INSERT OR UPDATE OR DELETE ON verification_officer_appointments FOR EACH ROW EXECUTE FUNCTION verification_appointment_change_lock();
CREATE FUNCTION verification_clearance_change_lock() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $governance$
DECLARE actor uuid;
BEGIN
 FOR actor IN SELECT DISTINCT officer_user_id FROM verification_officer_appointments WHERE id=ANY(ARRAY[CASE WHEN TG_OP<>'INSERT' THEN OLD.appointment_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.appointment_id END]) ORDER BY officer_user_id LOOP
  PERFORM pg_advisory_xact_lock(hashtext('verification-authority:'||actor::text));
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $governance$;
CREATE TRIGGER verification_clearance_change_lock BEFORE INSERT OR UPDATE OR DELETE ON verification_conflict_clearances FOR EACH ROW EXECUTE FUNCTION verification_clearance_change_lock();
-- Existing academic-role assignments participate in the same conflict lock.
CREATE FUNCTION verification_academic_assignment_change_lock() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $governance$
DECLARE actor uuid;
BEGIN
 FOR actor IN SELECT DISTINCT x FROM unnest(ARRAY[CASE WHEN TG_OP<>'INSERT' THEN OLD.user_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.user_id END]) x WHERE x IS NOT NULL ORDER BY x LOOP
  PERFORM pg_advisory_xact_lock(hashtext('verification-authority:'||actor::text));
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $governance$;
CREATE TRIGGER verification_academic_assignment_change_lock BEFORE INSERT OR UPDATE OR DELETE ON authority_assignments FOR EACH ROW EXECUTE FUNCTION verification_academic_assignment_change_lock();
COMMIT;
