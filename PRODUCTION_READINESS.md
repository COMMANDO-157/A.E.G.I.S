# A.E.G.I.S production readiness — 12 October 2026

Continuation of verified commit `1f6c593` on `stage-4.2`. No completed feature was rebuilt. Production schema, users, permissions and application configuration were not changed. A separate current recovery branch was created and verified; production migrations, real owner designation, merge, deployment and intake remain approval-gated.

## Verified production access and checkpoint

The newly connected Neon integration and the signed-in console both access project `icy-dust-49902301` (`aegis-production`). Every database operation explicitly targeted branch `br-falling-poetry-b3lrse12`, database `aegis`. The production compute is `ep-wispy-pond-b33jk0d8`, host `ep-wispy-pond-b33jk0d8.c-4.ap-southeast-1.aws.neon.tech`. Read-only identity checks returned `aegis` / `neondb_owner`, PostgreSQL 18.6. The old custom connector still targets development and was not used as a substitute. No connection string, password, API key, PIN or OTP was printed.

Production has migrations 001–004 only. Their normalized SHA-256 checksums exactly match the checked-in files. Password-reset/owner-entry tables and `step_up_tokens.session_hash` are absent. Counts: users 0, owners 0, complaints 0, departments 7, audit rows 0, migration records 4. There are no duplicate lowercase email groups.

`aegis_app_runtime` exists and can log in. It has no superuser, create-database, create-role, replication or bypass-RLS flags, and no inherited role memberships. Public-schema USAGE is granted; CREATE is denied. Audit access is SELECT/INSERT only, migration history is inaccessible, canonical departments are read-only, entity tables forbid hard deletion, and ephemeral tables have required DML without TRUNCATE. The append-only audit trigger exists. These are verified privilege/schema properties, not a claim that deployment credentials have been configured.

The older `pre-migration-recovery-20261012-2150` branch (`br-super-king-b3d0nbn1`) is empty: it lacks `users` and `schema_migrations`. It was created at 21:50:14 IST, before migrations 001–004 were recorded at 21:50:40 IST. Do not use it to recover the current application.

Created replacement **`pre-005-006-verified-20261012`**, branch **`br-bold-shadow-b3twkkdz`**, from production at parent LSN `0/2299060`, parent timestamp 23:41:15 IST; creation 23:41:30 IST. It is ready, has an empty schema diff against production, matching migration checksums and matching checked counts (users, complaints, departments, audit rows, migration records). No migrations or fixtures were written to this recovery branch. Retain it unchanged. Production's rolling history is six hours and there were no manual snapshots at inspection; refresh the checkpoint before an eventual approved migration if production has changed. No restore over production was performed.

## Reviewed migration changes and dependencies

| Migration | Reviewed behavior | Dependencies / grants |
| --- | --- | --- |
| 005 | Adds password fields and reset-token state, permits password-only accounts, enforces lowercase email uniqueness. Now revokes PUBLIC table access and grants only SELECT/INSERT/UPDATE/DELETE on the reset-token table to an existing `aegis_app_runtime`. | Applied 001–004 and an existing runtime role. No schema CREATE, TRUNCATE, REFERENCES or TRIGGER grant. No role/credential creation. |
| 006 | Adds session binding to existing step-up tokens, owner failure counters, owner challenges and grants. Revokes PUBLIC access and limits runtime owner-state access to DML. | Users and sessions from 001; MFA/PIN/single-owner constraint and step-up state from 003; 005 application behavior. Session foreign keys on owner state revoke it when the login session is deleted. |

Applied migrations 001–004 were not edited. The now-edited 005/006 were independently verified as unapplied in production. If another database has recorded older 005/006 checksums, do not override its history: use a separately reviewed repair migration or recreate that isolated test database.

The absent step-up session column was a real production dependency gap, found by local integration tests and confirmed through the production schema API. 006 now adds it without editing applied 003. Verification also no longer accepts a legacy NULL session binding as matching a current session. Existing TOTP plus Action PIN and single-use action tokens remain required for sensitive actions.

Another runtime mismatch affected initial MFA setup: production denies DELETE on recovery-code history. Setup now revokes previous unused codes through UPDATE, then inserts newly generated hashed codes. It preserves history and does not expand DELETE permissions. This was verified with the actual restricted runtime role in isolated PostgreSQL.

When separately approved, apply both migrations through the runner's single transaction and checksum bookkeeping, explicitly bounded with `--through=006_owner_portal.sql`. Verify the exact project/branch/host/database first; use a dedicated operator-only URL, `NODE_ENV=production`, `TARGET_ENV=production`, `EXPECTED_PRODUCTION_HOST=ep-wispy-pond-b33jk0d8.c-4.ap-southeast-1.aws.neon.tech`, `EXPECTED_PRODUCTION_DB=aegis`, and `EXPECTED_PRODUCTION_USER=neondb_owner`. Never put the operator URL in Vercel. The runner enforces certificate validation, uses an advisory lock and a five-second lock timeout. Do not execute the full runtime provisioning script before the new tables exist.

### Rollback / recovery procedure — review only

1. Before COMMIT: a migration error rolls back schema changes, grants and migration-history inserts together. Duplicate emails and lock/statement timeouts must abort, not be worked around.
2. After COMMIT, before live use: prefer a reviewed forward fix. If recovery is necessary, stop new writes, preserve any post-checkpoint data, and obtain separate approval for the exact restore operation. Use a fresh child of the verified recovery branch to validate recovered schema/history and counts before any production replacement. Do not reset the recovery branch itself.
3. After password-only registration: never blindly reapply NOT NULL to `google_subject_id`, drop password columns, or discard reset state. Reconcile those accounts and any subsequent writes in a reviewed data-preserving plan.
4. Owner-entry incident: fail owner access closed and revoke affected login sessions/owner grants through an approved operator procedure. Retain MFA enrollment, salted PIN hashes and audit history. Keep the step-up session-binding repair even if owner entry is disabled; returning to NULL-compatible step-up verification would weaken authentication.
5. Confirm runtime grants, migration checksums, audit immutability and full authorization tests after recovery. Restore execution and any production permission changes remain unapproved.

## Exact email-provider setup

The existing provider is **Resend**; no alternative integration was introduced. The adapter verifies a configured sender domain before submitting email and fails closed on missing configuration, verification mismatch or provider error.

1. In the operator's Resend account, add a domain/subdomain the operator controls. Publish the provider's displayed DNS records, verify sending status, and use a bare sender address on that exact domain. Do not invent DNS values. [Domain verification documentation](https://resend.com/docs/dashboard/domains/introduction).
2. Record the domain ID as `OWNER_EMAIL_DOMAIN_ID` and the bare address as `OWNER_EMAIL_FROM`. Domain retrieval must report `status=verified`, the configured domain name must match the sender, and sending must not be disabled. [Domain API](https://resend.com/docs/api-reference/domains/get-domain).
3. Provision a dedicated server-side `RESEND_API_KEY`. The current adapter needs both GET domain metadata and POST email. Resend's `sending_access` key cannot retrieve domain metadata; its `full_access` key can. Do not silently use a sending-only key or claim read-only scoping that the provider does not offer. Store the key in the server secret manager, outside frontend variables and source control. [API-key permissions](https://resend.com/docs/api-reference/api-keys/create-api-key).
4. Generate two independent random 32-byte hex secrets in the operator's secure secret-management workflow: `MFA_ENCRYPTION_KEY` and `OWNER_OTP_HMAC_KEY`. Preserve their recovery/rotation records securely; do not print, paste into chat, or reuse database/storage keys.
5. Run `npm run owner:email-check` with those server values securely supplied. It makes only a domain GET request and returns verification status with `emailSent=false`. It never generates an OTP or sends mail. It currently fails before networking because credentials are missing.
6. After provider configuration and separately approved owner setup, the designated owner initiates an entry and confirms inbox receipt of the fresh code. Provider acceptance alone is not proof of inbox delivery. No real email or OTP was sent in this continuation.

## Primary Owner preparation — no real designation performed

Production has no account candidate yet. The operator must explicitly identify the intended human owner; Neon account identity and Git authorship are not evidence of the A.E.G.I.S owner identity.

After separately approved migrations/deployment, that human signs in through verified Google authentication. Record the resulting existing account UUID, email and Google subject. Securely supply `PRIMARY_OWNER_USER_ID`, `PRIMARY_OWNER_EMAIL`, and operator-only `PRIMARY_OWNER_GOOGLE_SUBJECT`. Keep live intake false.

`npm run owner:prepare` is read-only, refuses non-production operator targets, requires the exact ID/email/subject and active account, and rejects a different existing owner. It produces an approval-required plan. The local `.env` still points to development and is intentionally unchanged; obtain a verified production operator connection through the approved secret workflow for this command.

Only after separate owner-bootstrap approval should an operator perform the reviewed exact-account designation in one transaction, check the single-owner constraint, revoke existing sessions, and record an audit event. Do not run the older generic bootstrap command against an unverified URL or infer an account from email alone.

The owner then signs in again, enrolls and confirms their authenticator if needed, verifies a fresh emailed OTP, and chooses their own 5-digit PIN in the existing `/owner` setup form. The PIN is salted/scrypt-hashed, never assigned by the operator or hardcoded. Subsequent portal entries require that PIN plus a fresh OTP. Sensitive actions additionally retain TOTP plus PIN step-up. PIN/MFA replacement recovery remains a separate reviewed procedure.

## Validation / remaining limits

- Core authentication/owner tests: 63 passed. Frontend regressions: 28 passed. Baseline: 37 passed. Verification/escalation: 61 passed.
- Remaining PostgreSQL suites ran on separate disposable local databases with a native PostgreSQL 18.4 server, verified TLS, SCRAM credentials and separate operator/runtime roles: roster schema/scoping/concurrent locks, stage 5.5A, stage 5.5B, stage 5.5C, stage 6, and the 33-check HTTP/PostgreSQL integration suite all passed. No development, disposable Neon or production credentials were used.
- Added isolated-only `test_owner_postgres.js`: 11 SQL scenarios passed, including true concurrent OTP consumption, legacy unbound-token rejection, session-bound single use, cross-session rejection, persistent lockout, restricted-runtime MFA setup and confirmation, first PIN enrollment, and session cascade revocation. It refuses remote databases or execution without explicit isolated-test opt-in.
- Local PGlite migration rehearsal: 14 checks passed, including checkpoint restore, atomic duplicate-email failure, repeatability, scoped grants and Owner flow SQL. Synthetic data and mocked email only.
- Ordinary `npm --prefix frontend run build` and TypeScript checking now pass. Diagnostic reads/stat/standard realpath succeeded, but native realpath failed with EPERM even for a copied file inside the writable workspace. Vite now uses its supported original-path option only when this exact Windows condition is detected, with React deduplication. Other permission errors propagate; no ACL, antivirus or security setting was disabled. [Vite option](https://vite.dev/config/shared-options.html#resolve-preservesymlinks).
- The native test server was stopped after tests. Actual Google sign-in and inbox delivery remain unverified until approved production configuration/setup. Headless browser UI suites remain a separate environment check; SQL/API integration results do not claim live browser/inbox completion.
- Remaining operator actions: configure server secrets/provider/domain, explicitly identify the human candidate, approve migrations 005/006 against this reviewed revision and checkpoint, then separately approve any real designation, merge, production deployment or intake activation. None of those approval-gated actions was performed.
