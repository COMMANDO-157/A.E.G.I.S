-- ==============================================================================
-- A.E.G.I.S — Production & Staging Runtime Role Provisioning Script
-- Target Database: aegis
-- Target Role: Parameterized (:runtime_role or aegis_app_runtime)
-- Security Posture: Strict Least Privilege (DML-only, Append-only Audit, No DDL)
-- ==============================================================================
--
-- INSTRUCTIONS FOR OPERATOR:
-- 1. Execute strictly as database owner ('neondb_owner') on database 'aegis'.
-- 2. Ensure target runtime role exists with:
--      CREATE ROLE aegis_app_runtime WITH LOGIN PASSWORD '...'
--        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- 3. Run this script via psql or automated runner.
--
DO $$
DECLARE
  v_runtime_role text := COALESCE(NULLIF(current_setting('aegis.runtime_role', true), ''), 'aegis_app_runtime');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_runtime_role) THEN
    RAISE EXCEPTION 'Target runtime role % does not exist. Create the role first.', v_runtime_role;
  END IF;

  RAISE NOTICE 'Provisioning hardened least-privilege permissions for role: %', v_runtime_role;

  -- 1. Schema Access: USAGE only (REVOKE CREATE blocks DDL table/type creation)
  EXECUTE format('REVOKE ALL ON SCHEMA public FROM %I', v_runtime_role);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', v_runtime_role);
  EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %I', v_runtime_role);

  -- 2. Neutralize Public & Administrative Access
  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
  REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

  -- 3. Total Isolation of Migration Tracking
  EXECUTE format('REVOKE ALL ON TABLE schema_migrations FROM %I', v_runtime_role);

  -- 4. Audit Log Immutability: SELECT, INSERT only (UPDATE and DELETE prohibited)
  -- Enforced by both grant boundaries and the deny_audit_mutation trigger
  EXECUTE format('GRANT SELECT, INSERT ON TABLE audit_logs TO %I', v_runtime_role);
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_logs FROM %I', v_runtime_role);

  -- 5. Canonical Reference Data: Strict Read-Only Catalog
  EXECUTE format('GRANT SELECT ON TABLE departments TO %I', v_runtime_role);
  EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE departments FROM %I', v_runtime_role);

  -- 6. Immutable Linkages and Review Records (Append & Read only)
  EXECUTE format('GRANT SELECT, INSERT ON TABLE case_links, verification_reviews, complaint_evidence TO %I', v_runtime_role);
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE case_links, verification_reviews, complaint_evidence FROM %I', v_runtime_role);

  -- 7. Application State & Entity Records (No Hard Delete Permitted)
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE users, complaints, student_rosters, student_verification_requests, authority_assignments, roster_import_conflicts, admin_invitations, mfa_recovery_codes TO %I', v_runtime_role);
  EXECUTE format('REVOKE DELETE, TRUNCATE ON TABLE users, complaints, student_rosters, student_verification_requests, authority_assignments, roster_import_conflicts, admin_invitations, mfa_recovery_codes FROM %I', v_runtime_role);

  -- 8. Ephemeral State, Sessions & Quotas (Full DML for TTL Pruning & Consumption)
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sessions, auth_challenges, rate_limits, admin_permissions, step_up_tokens TO %I', v_runtime_role);
  EXECUTE format('REVOKE TRUNCATE ON TABLE sessions, auth_challenges, rate_limits, admin_permissions, step_up_tokens FROM %I', v_runtime_role);

  -- 9. Explicit Denial of Sequence / Serial Privileges (All PKs use UUID / Gen_Random_UUID)
  EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', v_runtime_role);

  RAISE NOTICE 'Hardened runtime permissions successfully applied for %', v_runtime_role;
END $$;
