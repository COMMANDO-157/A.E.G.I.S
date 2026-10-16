# A.E.G.I.S. — G09.2 Phase 1.2 integration hardening

Date: 16 October 2026 (Asia/Calcutta)

Status: Final local review passed; authorized for one local commit. **G11 STRICT HOLD.**

## Checkpoint and preservation

Repository: `C:/Users/sures/Projects/A.E.G.I.S`

Verified baseline/pre-commit HEAD: `c54d76d80fed5a41073f515bdb948a3bb129bd7e`.

Created dedicated branch `feature/g09.2-phase1.2-integration-hardening` from the verified Phase 1 commit. The original Phase 1 branch was not advanced. Initial tracked tree/index were clean. The pre-existing untracked `scripts/check-duplicates.js` was not edited or staged; its SHA-256 remains `0E65B3D44238C30A01D2E66C6939DDE3CB132D4CAA40A8C690890BC773579B87`.

No historical migration was edited. Migrations 001–007 were applied only inside fresh disposable databases, independently through 006 and through 007. No new schema migration was necessary for these source corrections.

## Implemented corrections

### Institution compatibility

Department creation includes the required institution ID on 007 and retains the legacy insert on 006. An explicit invalid institution cannot silently fall back to another institution. Roster conflict resolution supplies institution ID on 007, validates the department/institution relationship, retains the legacy column set on 006 and rejects modification of a bound identity. Quarantined import evidence retains the selected institution for later resolution.

Schema 006 continues to support account sign-in and the tested reference-maintenance operations. It cannot establish active-institution/non-test enrollment eligibility: new enrollment requests, institution-dependent roster import and the Owner enrollment console fail closed. Existing bound student sessions remain authenticated but are not treated as enrollment-eligible until authoritative 007 information is available. Stored verification flags and historical bindings are not automatically deleted or demoted. This is a deliberate compatibility restriction, not a claim of complete 006 feature parity or authorization to apply 007 elsewhere.

### Roster concurrency

Import acquires a transaction-scoped register lock and locks the existing roster row before checking its binding. Its conditional upsert also requires an unbound row with matching institution, email and department; it cannot reassign an existing identity. Imported counts reflect actual writes. Conflict resolution uses the same register lock, row lock and conditional bound-row protection.

Real tests exercise both race orderings: approval first causes import to wait and skip the now-bound row; import first commits its permitted unbound-record update before approval binds it. Competing approvals produce one binding/approval audit. Concurrent imports cannot overwrite a bound identity.

### Eligibility and evidence

New `server/enrollment.js` centralizes roster eligibility: active institution, active roster, excluded test records, active department and matching institution. Manual approvals and continuing sessions use it; Google automatic matching applies the same conditions and fresh-login results recheck reciprocal binding. Manual approval locks the roster and takes shared locks on its institution/department. An account/roster mismatch does not acquire enrollment eligibility.

Delegated manual decisions now persist `verification_method` in the request row as well as recording audit provenance. Eligibility is required for approval, while rejection remains possible for an ineligible claim. Existing Owner/administrative authorization and step-up checks remain.

### Test reliability

Hybrid fixtures now map institution/status/channel/notes to the actual SQL parameters, return the actual roster binding and `current_roster_id`, use explicit institution references and restore snapshot state on transaction failure. Assertions inspect persisted pending-request fields. The Google-login fixture supplies the reciprocal binding required by the updated result check. These remain mocks and do not claim PostgreSQL semantics.

`server/db.js` accepts an optional explicit pool for the transaction helper; ordinary runtime behavior still defaults to the existing configured pool. The real integration suite uses this application helper with a synthetic local pool rather than duplicating its transaction implementation. HTTP callers cannot choose a pool.

## Exact changed files

All paths below are relative to the repository above. Six existing files are modified and four files are new, including this report.

| File | Change |
|---|---|
| `package.json` | Explicit opt-in `test:phase12:db` command; normal tests do not connect to PostgreSQL |
| `server/auth.js` | Google matching and continuing session eligibility |
| `server/db.js` | Explicit pool injection for real transaction integration tests |
| `server/handler.js` | Institution-aware writes, roster locking/upsert guards, approval eligibility and method persistence |
| `test_google_identity.js` | Updated reciprocal-binding fixture |
| `test_stage5_5d_hybrid_verification.js` | Corrected SQL/result mappings, fixture references and rollback behavior |
| `server/enrollment.js` — new | Shared eligibility and institution-resolution checks |
| `test_phase12_postgres.js` — new | Real PostgreSQL integration suite for boundaries 006/007 |
| `scripts/run-phase12-postgres.mjs` — new | Fresh local cluster setup, bounded test execution and automatic shutdown |
| `G09_2_PHASE1_2_INTEGRATION_REPORT.md` — new | This implementation/evidence report |

No frontend source changes were needed. `scripts/check-duplicates.js` is unrelated and excluded. Generated build output, native binaries, disposable data and local credentials are not part of this source package.

## Disposable database setup and evidence

Native **PostgreSQL 18.4**, Windows x64, was initialized from an empty data directory. Only the existing binary bundle was reused; no existing database cluster, records, credentials or environment file was reused. The cluster listened on **127.0.0.1** at a newly selected local port with generated SCRAM test credentials. TLS was disabled only for this disposable loopback connection.

The reproducible runner creates its own fresh temporary directory, operator credential and cluster. It gives the test process a restricted child environment without inherited database/provider credentials, waits for its own local server, runs the suite and stops its cluster in `finally`. Test execution is bounded to 60 seconds. The temporary plaintext connection/password files are removed. Synthetic database files and sanitized evidence remain for review; no recursive cleanup of unrelated paths occurs.

The suite independently creates two fresh databases, applies unchanged migration bodies through 006/007, and creates a synthetic DML runtime role distinct from the operator. It verifies runtime identity, denied schema CREATE and denied audit DELETE. Tests verify the actual connected data directory and loopback address. Migration checksums, server version and database/role identities are emitted in `ISOLATION_EVIDENCE`.

These are **test-specific grants**, not a production privilege certification. The test role has broader synthetic DML access than a final capability-isolated architecture should have. Deployed login roles, inherited grants, RLS and operator separation remain **UNVERIFIED**.

Reproduction from the repository:

```powershell
node scripts/run-phase12-postgres.mjs --pg-bin=<absolute-path-to-native-PostgreSQL-bin>
```

The lower-level `npm run test:phase12:db` command requires an explicit `AEGIS_PHASE12_LOCAL_CONFIG` for this disposable setup and rejects missing/nonmatching configuration. It does not load `.env` or silently connect to a configured application database.

Both the initial development cluster and every fresh-runner cluster were stopped. No PostgreSQL instance created by this task remains running.

## Final verification

| Check | Actual result | Boundary |
|---|---|---|
| `npm test` | **90 passed, 0 failed** | Mocks, in-memory fixtures and loopback mock HTTP; no real database/provider |
| Fresh PostgreSQL runner | **32 passed, 0 failed** | 31 scenarios plus one enclosing Node test; real PostgreSQL at independent 006/007 boundaries |
| `npm --prefix frontend test` | **29 passed, 0 failed** | Frontend regression tests |
| `npm --prefix frontend run typecheck` | **Passed** | TypeScript, no emit |
| `npm --prefix frontend run build` | **Passed** | Includes another TypeScript check and Vite build |
| `node test_baseline.js` | **37 passed, 0 failed** | Legacy in-memory/storage regression checks |
| Existing Phase 1 browser runner | **11 groups passed** | Built frontend, synthetic API responses, external requests blocked; includes 14 semantic contrast pairs |
| Git whitespace/scope checks | **Passed** | Final patch and preserved migration/user-file boundaries |

Real database cases cover same-account and cross-account linking races, duplicate subject/email constraints, concurrent challenge consumption and replay, profile/session/challenge rollback, authoritative Google enrollment, excluded test records, inactive institutions/departments, mismatched institutions, reciprocal binding conflicts, expired approval, decision-method persistence, competing approvals, batch rollback and both import/approval orderings.

Google token verification is injected with synthetic verified-claim fixtures. This exercises real account/roster/challenge SQL but **does not test Google's signature/JWKS service or real OAuth**. Handler tests use synthetic sessions/Owner grants and step-up tokens; they do not demonstrate delivery of real OTPs or reenact a real provider sign-in. Owner MFA/PIN regressions remain covered by the local backend suite.

Two integration harness assertions were corrected during development: PostgreSQL's address formatting and the existing API's fail-closed 503 response for a constraint failure. Final runs have no failures. One build-log redirection wrapper failed after a successful build; the build was rerun with correct logging and passed. The existing nonblocking Vite static/dynamic import warning remains. No application behavior was relaxed to make these assertions pass.

Evidence: `C:/Users/sures/.codex/.chatgpt-projects/g-p-6ac879c230608191973f009abb6bacc3/inspection/phase12-backend.txt`, `phase12-frontend.txt`, `phase12-build.txt`, `phase12-legacy.txt`, `phase12-fresh-cluster.txt`, and `phase12-browser/`.

Final fresh-runner evidence is also retained at `C:/Users/sures/AppData/Local/Temp/isolated_aegis_phase12_oXrQdx/.verification/phase12/`; its integration log contains the exact synthetic database names, role and migration hashes without credentials.

## Remaining blockers and approval boundary

- Actual Google OAuth/JWKS, browser cookie behavior against real OAuth, mail/OTP delivery and deployed access control were not exercised.
- PostgreSQL tests ran on local 18.4; the inherited description of a deployed 18.6 environment is not independently verified. Exact target-version/configuration parity remains a later check.
- Schema 006 cannot support the strengthened enrollment rules without authoritative 007 data. Applying 007, approving its sample/default institution configuration, or activating enrollment elsewhere requires separate review and authorization.
- Historical identity reconciliation was not performed. No real account was inspected or changed. Existing questionable bindings require an independently authorized audit and review process.
- Real database constraints still do not enforce every reciprocal/institution invariant against arbitrary privileged SQL. Runtime privileges and the full C1–C6 architecture remain separate release requirements. This patch does not implement invitations, disclosure quorum, well-being capability isolation or legally approved retention.
- Existing broadly delegated administrative verification remains a compatibility bridge; independent officer appointments, recusal, leases and appeals remain unresolved. The named amended readiness record is still unavailable from the earlier review.
- The tests cover named race scenarios, not every possible workload or deadlock. General deadlock retry policy and broader application/schema compatibility remain outside this correction package.
- Sampled browser/accessibility tests do not certify complete WCAG conformance or all localized staff workflows.

Authorized local commit message: `fix(aegis): harden institution eligibility and roster concurrency`

At the implementation handoff, changes were unstaged and uncommitted. The user subsequently authorized the final local review and one commit; see the review record below. No push, merge, deployment, remote database/Neon access, production/staging migration, real OAuth action, real message delivery or live intake/account/roster/credential change occurred. All account and database writes were synthetic and confined to disposable local clusters. **G11 remains STRICT HOLD.**

## Final review and commit record — 16 October 2026

The user explicitly authorized one local commit with the message above. All ten authorized files were reviewed; no critical security or regression blocker was identified. No application or test code changed during this final review.

Fresh verification passed: real disposable PostgreSQL 32/32 (31 scenarios plus enclosing test), backend 90/90, frontend 29/29, legacy 37/37, and TypeScript. Existing successful build and 11-group synthetic browser evidence was reviewed; those two checks were not rerun during the commit review. All documented integration, schema-006 and deployment limitations remain.

Fresh evidence is in the workspace `inspection/phase12-commit-postgres.txt`, `phase12-commit-backend.txt`, `phase12-commit-frontend.txt`, `phase12-commit-legacy.txt`, and `phase12-commit-typecheck.txt`. The new disposable cluster was stopped automatically; evidence is retained at `C:/Users/sures/AppData/Local/Temp/isolated_aegis_phase12_7xJiD4/.verification/phase12/`.

Branch and pre-commit HEAD matched the expected checkpoint. Migrations 001–007 remain unchanged; the unrelated untracked script hash still matches the preservation record. Only the ten listed files are authorized for staging. The final commit inventory and parent are verified after creation; its SHA is returned separately rather than embedded in its own contents. No remote or production operations occurred. G11 remains STRICT HOLD.
