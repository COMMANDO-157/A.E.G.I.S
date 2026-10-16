# A.E.G.I.S. — G09.2 Phase 1.3 controlled development

Date: 16 October 2026 (Asia/Calcutta)

Status: Final source review passed; authorized for one local commit. **G11 STRICT HOLD.**

## Verified baseline and preservation

- Repository: `C:/Users/sures/Projects/A.E.G.I.S`.
- Starting branch: `feature/g09.2-phase1.2-integration-hardening`.
- Pre-commit baseline HEAD: `d2bd6113fa24ca642d3e783c36b17c32476d2519`.
- Created branch: `feature/g09.2-phase1.3-verification-governance`.
- Baseline backend: 90 passed. Baseline disposable PostgreSQL: 32 passed.
- Original tracked tree/index were clean. `scripts/check-duplicates.js` remains the unrelated untracked file, untouched, with SHA-256 `0E65B3D44238C30A01D2E66C6939DDE3CB132D4CAA40A8C690890BC773579B87`.
- Historical migrations 001–007 are unchanged. No synced project source was edited.

## Implemented security foundations

### Independent manual verification

Legacy Owner verification listing, approval/rejection and enrollment-revocation endpoints now deny access. The Primary Owner no longer inherits `department.students.verify`. This is an intentional defensive compatibility change: infrastructure ownership cannot supply enrollment authority or an override.

The existing administrative review API now requires all of the following:

1. An active existing administrative account and the actual explicit verification permission, re-read from the database rather than trusted solely from a session.
2. No Primary Owner flag, HOD/Dean/Higher Authority role or active academic authority assignment. Academic dual-role compatibility remains blocked pending an institutional decision.
3. Exactly one independently recorded current appointment matching institution, department and cohort, with a finite expiry and an appointment reference. No wildcard scope or implicit renewal is introduced.
4. A current claim-specific CLEARED conflict record attributable to someone other than the reviewer or enrollment subject. Missing, UNKNOWN, CONFLICT, expired, revoked or self-attested clearance denies the decision.
5. Existing session-bound, single-use privileged step-up; no self-verification; current claim expiry; explicit institutional method, bounded evidence reference and decision notes.
6. Atomic audit provenance identifying reviewer, request, appointment, clearance, decision and evidence method. The institutional evidence reference stays in the decision record rather than being copied into the new general audit event. Audit-write failure rolls back enrollment and the decision.

The queue is restricted to individually cleared claims within current appointment scope. Reads and decisions use one transaction and the same authority lock as proposal mutation triggers. Appointment/clearance revocation and academic-assignment changes therefore cannot silently leave a stale conflict result between authorization and protected access. Trigger absence/disablement fails closed. Real tests cover both revocation orderings and queue revocation.

No appointment-writing API, automatic appointment, new staff role, real clearance or deployment grant is created. Administrative routes are only a compatibility transport for the synthetic foundation; a separately approved officer role and portal remain necessary. Existing administrative permission alone is insufficient.

### Identity assurance remains separated

| Layer | Implemented boundary |
|---|---|
| Google authentication | Existing issuer/audience/expiry/nonce and subject/email binding checks remain; no real OAuth call was performed. |
| Academic profile | Self-entered profile fields do not establish enrollment or staff powers. |
| Enrollment | Active reciprocal authoritative roster checks remain. Consumer `gmail.com`/`googlemail.com` cannot trigger automatic enrollment even if configured as trusted domains; independently evidenced manual review remains a separate path. |
| Institutional roles | Existing explicit role-assignment controls remain separate from sign-in and enrollment. No account is promoted by this phase. |
| Protected services | Existing server-side eligibility/role checks remain; appointment revocation does not automatically revoke a student's previously recorded enrollment. Historical reconciliation is separate. |

Existing account sign-in remains available. Manual verification on existing 006/007 installations without the proposed governance schema is intentionally unavailable. Existing verified records are not automatically rewritten, demoted or retroactively certified.

### Read-only historical audit foundation

`server/identity-audit.js` is a pure analyzer with no database, filesystem or provider connector. It detects duplicate subjects/emails, missing or nonreciprocal account/roster bindings, multiple bindings, missing/inactive institutions, institution/department inconsistencies, ineligible rosters and alternate-email evidence gaps. Subject presence alone does not establish historical verified-email ownership.

`npm run audit:synthetic` accepts only its built-in synthetic fixture. There is no database URL or account-export input option. Output includes issue codes and per-run keyed pseudonyms; raw account/roster IDs, emails, names and Google subjects are omitted. Tests verify input immutability, absence of raw identifiers and different pseudonyms across runs. Alternate email is an evidence-review indicator, not a fraud verdict. No audit result changes an account or enrollment record.

## Proposal-only database dependency and unresolved governance

`proposals/008_verification_governance_PROPOSAL.sql` is outside `migrations/`; the ordinary migration runner does not discover it. It creates empty appointment/clearance tables, two associated mutation-lock triggers and a lock trigger on existing academic assignments. It creates no database role, grant, institutional appointment, clearance row or retention rule. It was technically reviewed and validated only inside disposable local PostgreSQL; institutional approval is not implied.

The application is tested with SELECT-only access to the proposed appointment/clearance tables. Runtime insert/update/delete on them is denied. PostgreSQL row locks originally required update privilege; the proposal was corrected to coordinate via actor advisory locks and mutation triggers instead of granting write access. Privileged DDL/operators can still bypass these mechanisms; deployed privilege/ownership controls remain UNVERIFIED.

The concrete activation proposal is `proposals/VERIFICATION_GOVERNANCE_ACTIVATION_PROPOSAL.md`. It identifies these unresolved blockers:

- Authorized appointing/revoking function and independently validated appointment evidence.
- Officer staff-role/portal and authentication/step-up provisioning model.
- Institution/department/cohort scope, delegation maximum, renewal and overlap policy. No 180-day maximum is silently selected.
- Conflict-clearance custodian, authoritative conflict source, freshness, cohort freeze/restoration and independent alternate coverage. The software enforces the supplied clearance state; it does not discover all material relationships or approve that state itself.
- Independent appeals, enrollment-revocation and historical reconciliation process. There is no replacement Owner override.
- Authoritative roster/domain custody and separation from infrastructure control. Existing registry administration remains a distinct trust boundary; the manual-decision guard does not establish independent provenance of all existing registry data.
- Exact deployed runtime/operator privileges, trigger custody, schema promotion and rollout/rollback approval.

C1–C6 and UD1–UD8 remain separate architecture/policy decisions. No invitation, disclosure quorum, retention period, student-services module or well-being implementation was added. The previously missing amended readiness record is not invented or treated as resolved.

## Exact changed files

Ten existing files are modified; seven files are new, including this report. Paths are relative to the repository above.

| File | Purpose |
|---|---|
| `frontend/src/pages/authority/AuthorityStudentsPage.tsx` | Remove Owner UI entitlement and require evidence/method for both decisions |
| `package.json` | Add governance tests and explicit synthetic audit/proposal-test commands |
| `scripts/run-phase12-postgres.mjs` | Explicit `--verification-proposal` opt-in for disposable-only validation |
| `server/auth.js` | Prevent consumer Gmail domain configuration from granting automatic enrollment |
| `server/handler.js` | Retire Owner verification override; scope queue and decisions; record evidence/provenance atomically |
| `server/policy.js` | Exclude enrollment verification from Owner permission inheritance |
| `test_auth.js` | Updated permission-isolation regression |
| `test_google_identity.js` | Consumer Gmail enrollment regression |
| `test_phase12_postgres.js` | Proposal/no-proposal real database tests and governance/concurrency cases |
| `test_stage5_5d_hybrid_verification.js` | Replace obsolete Owner approval expectations with explicit denial assertions |
| `proposals/008_verification_governance_PROPOSAL.sql` — new | Unapplied governance schema/lock proposal |
| `proposals/VERIFICATION_GOVERNANCE_ACTIVATION_PROPOSAL.md` — new | Concrete policy, privilege and activation blockers |
| `scripts/audit-synthetic-identities.mjs` — new | Synthetic-only audit entry point |
| `server/identity-audit.js` — new | Pure privacy-conscious consistency analyzer |
| `server/verification-governance.js` — new | Authoritative appointment, conflict, scope and queue guards |
| `test_verification_governance.js` — new | Pure governance, legacy-route denial and audit privacy tests |
| `G09_2_PHASE1_3_IMPLEMENTATION_REPORT.md` — new | This report |

The unrelated untracked `scripts/check-duplicates.js` is excluded. Build artifacts, PostgreSQL binaries/data, synthetic credentials and workspace test logs are not source changes.

## Actual verification results

| Command/check | Final result | Limits |
|---|---|---|
| `npm test` | **102 passed, 0 failed, 0 skipped** | Mocks/pure tests and local mock HTTP; includes new governance and identity audit tests |
| Fresh runner with `--verification-proposal` | **49 passed, 0 failed, 1 skipped** out of 50 reported tests | Real PostgreSQL; count includes enclosing test. Missing-schema case is covered separately below |
| Fresh runner without proposal | **27 passed, 0 failed, 9 skipped** out of 36 reported tests | Real PostgreSQL 006/007; confirms missing-schema denial. Nine appointment-dependent positive/concurrency scenarios intentionally require the proposal run |
| `npm --prefix frontend test` | **29 passed, 0 failed** | Existing frontend regression suite |
| `npm --prefix frontend run typecheck` | **Passed** | TypeScript |
| `npm --prefix frontend run build` | **Passed** | TypeScript/Vite; existing nonblocking static/dynamic import warning remains |
| `node test_baseline.js` | **37 passed, 0 failed** | Legacy in-memory/storage checks |
| Phase 1 browser runner | **11 groups passed** | Synthetic API responses; external requests blocked; includes 14 contrast samples and HOD denial |
| `npm run audit:synthetic` | **Passed** | Built-in synthetic fixture only; no records read or changed |
| Git whitespace/preservation checks | **Passed** | Index empty, HEAD unchanged, migrations unchanged, unrelated script hash preserved |

Real PostgreSQL tests exercise explicit appointment/clearance requirements, Owner denial, expired/revoked authority, active academic-role conflicts, self-verification, exact scopes, overlapping appointments, permission revocation despite stale sessions, queue filtering, audit provenance/rollback, both revocation orderings, queue reads behind revocation, existing roster races, challenge replay/rollback, duplicate identities and account compatibility. Automatic Gmail denial is exercised against deliberately misconfigured synthetic domains. Existing Google claims are injected fixtures: signature/JWKS and real Google accounts are not tested.

Development failures exposed a read-only table/row-lock permission mismatch and a proposal SQL quoting error; both were corrected before the final runs. Legacy Owner-success assertions were updated to the deliberately denied behavior. Initial pure-test setup assumptions were corrected. The final results above have no failing executed tests; skips are intentional and explicitly separated by schema mode.

## Isolation and evidence

All PostgreSQL runs initialized fresh local clusters with generated test credentials, bound to 127.0.0.1. Real application handlers and the transaction helper operated on synthetic accounts, institutions, appointments, clearances and rosters. The proposal was applied only to the disposable 007 test database under the explicit flag. The operator and runtime were synthetic local test roles; no shared role, credential or real account was accessed.

PostgreSQL version: **18.4 Windows x64**. Production version/configuration parity and deployed roles/grants/RLS remain UNVERIFIED. All clusters created by the tests were stopped, including a failed development run terminated by the runner deadline. Generated plaintext connection/password files were removed. Process inspection found no running task-created disposable PostgreSQL server.

Final evidence is under `C:/Users/sures/.codex/.chatgpt-projects/g-p-6ac879c230608191973f009abb6bacc3/inspection/`: `phase13-backend.txt`, `phase13-postgres-proposal.txt`, `phase13-postgres-no-proposal.txt`, `phase13-frontend.txt`, `phase13-build.txt`, `phase13-legacy.txt` and `phase13-browser/`. Baseline logs use `phase13-baseline-backend.txt` and `phase13-baseline-db.txt`. Database logs include exact disposable database identities, migration hashes and isolation evidence without credentials.

Final proposal-run cluster evidence: `C:/Users/sures/AppData/Local/Temp/isolated_aegis_phase12_f9MEBG/.verification/phase12/`. Final no-proposal evidence: `C:/Users/sures/AppData/Local/Temp/isolated_aegis_phase12_ybSh5H/.verification/phase12/`.

Reproduce only with native local binaries:

```powershell
node scripts/run-phase12-postgres.mjs --verification-proposal --pg-bin=<absolute-native-PostgreSQL-bin>
node scripts/run-phase12-postgres.mjs --pg-bin=<absolute-native-PostgreSQL-bin>
npm run audit:synthetic
```

## Next package and commit boundary

Recommended Phase 1.4: resolve and record appointment/clearance custody, staff-role/portal, duration/conflict/appeal and authoritative registry policies; then separately authorize forward-migration promotion, least-privilege review and a scoped appointment-custody service/portal rehearsal. Any real historical audit or corrective account action needs separate explicit authorization. Full screen-reader/localization and real OAuth integration remain unverified.

Proposed commit message: `feat(aegis): add independent verification guards and synthetic identity audit`

**Final review and commit authorization:** The user authorized staging only these 17 files and one local commit. Independent source review found no critical commit blocker. Backend 102/102, frontend 29/29, legacy 37/37, TypeScript and build passed again. Fresh disposable PostgreSQL repeated 49 passed/1 intentional skip with the proposal and 27 passed/9 intentional skips without it; both clusters stopped. Existing browser evidence was inspected (11 passing groups, synthetic fixtures only). Historical migrations and the unrelated script hash remained unchanged. No push, merge, deployment, shared-database connection, real student/account access, real OAuth/mail action or intake change occurred. Deployed privileges remain UNVERIFIED. G11 remains STRICT HOLD. The resulting commit SHA is reported separately to avoid a self-referential hash.
