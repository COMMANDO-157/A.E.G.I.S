# A.E.G.I.S owner portal continuation — 12 October 2026

## Completed

- Pushed the exact requested commit `317ec2305e073d55cc61eae95084cb48884aa977` to `origin/stage-4.2`; verified the remote ref afterward.
- Added an owner entry gate without public navigation links. A normal authenticated session alone cannot read owner data through `/owner`, shared admin APIs, or shared case/roster APIs. Owner visits to `/admin` redirect through `/owner` entry.
- Reused the existing salted scrypt 5-digit Action PIN. Existing TOTP plus PIN, single-use action step-up checks remain required for sensitive actions.
- Added a fresh 6-digit emailed OTP for each entry. OTP hashes use a separate server HMAC key and bind to the challenge, owner, and login session. Challenges expire after five minutes, are consumed under database row locks, and are replaced on a new entry. A PIN change invalidates a pending challenge.
- Entry grants are random, hashed in the database, session-bound, and expire after ten minutes. The frontend keeps the grant only in memory, clears it on portal exit/page hide, and locks when the server rejects it. Reloads and new tabs require fresh entry. Expired or revoked login sessions invalidate grants; database foreign keys remove entry state when sessions are deleted.
- Added database-backed rate budgets and shared owner lockout after five failures for fifteen minutes. Wrong PINs also increment the existing Action PIN lockout. Generic owner errors and no caller-supplied email prevent owner-email enumeration through the entry endpoints.
- First owner PIN setup requires emailed OTP plus the already enrolled authenticator. No endpoint designates an owner. The shared PIN setup API cannot replace the owner's PIN, and enrolled authenticator replacement is blocked pending a separate secure recovery process.
- Added a Resend adapter that checks the configured sender domain's verified status before sending, requires provider acceptance, and never returns/logs OTPs. Missing credentials or delivery failures fail closed. No real email was sent; provider behavior was tested with simulated responses. API references: [domain retrieval](https://resend.com/docs/api-reference/domains/get-domain), [email sending](https://resend.com/docs/api-reference/emails/send-email).
- Fixed the missing `production` import and disabled password-reset-token responses in production even if a test flag is accidentally set.
- Fixed migration wrapper handling so leading comments cannot cause an embedded COMMIT before checksum bookkeeping; added a five-second lock timeout and `--through=<filename>` boundary.

## Production migration 005 — blocked, not applied

Authorized target: project `icy-dust-49902301`, branch `br-falling-poetry-b3lrse12`, database `aegis`, endpoint `ep-wispy-pond-b33jk0d8.c-4.ap-southeast-1.aws.neon.tech`.

The Neon connector rejected that project because its OAuth connection is scoped to development project `sparkling-dew-62423509`. Both local connection URLs point to `ep-spring-queen-b3ikgnvo-pooler.c-4.ap-southeast-1.aws.neon.tech`, using `aegis_runtime`/`aegis_owner`. Neither is an independently verified connection to the authorized production target. No database query was executed on a substituted project, no production checkpoint was created/verified, and no migration was applied.

Static review of 005: it preserves existing rows, relaxes Google subject nullability, adds password fields/reset-token state, and creates a case-insensitive unique email index. Before applying, production must be checked for duplicate lowercased emails, schema/checksum compatibility, existing grants, and a restorable checkpoint. The unique index can fail with existing case variants. Reinstating NOT NULL later is not safe once password-only accounts exist; recovery must use the verified checkpoint and a reviewed plan preserving any subsequent writes.

Once production access is restored, first create and independently verify a recoverable checkpoint and rehearse 005 on an isolated copy. Use the explicit production target checks and `--through=005_password_auth.sql` to avoid accidentally applying 006. Validate and grant the new reset-token table's required DML to `aegis_app_runtime` within the reviewed migration transaction; 005 does not itself grant that access. Do not execute the latest full runtime provisioning script before 006, because that script now references the new owner-state tables.

## Owner portal activation — separate approval required

Migration `006_owner_portal.sql` is prepared but unapplied. It adds entry challenges/grants and owner failure counters, with scoped DML grants only to an already existing `aegis_app_runtime` role. It creates no owner, secrets, or role. Its session foreign keys require the existing sessions primary key.

Server-only configuration is listed with empty values in `.env.example`: `PRIMARY_OWNER_USER_ID`, `PRIMARY_OWNER_EMAIL`, `OWNER_OTP_HMAC_KEY` (independent random 32-byte hex), `RESEND_API_KEY`, `OWNER_EMAIL_FROM`, and `OWNER_EMAIL_DOMAIN_ID`. The provider key must permit domain retrieval and sending. Keep keys out of frontend variables and source control. Existing production MFA key configuration remains required. The immutable configured owner email must match the explicitly designated active owner record.

Owner designation/bootstrap, 006 application, provider configuration with an actual delivery test, production deployment, PR #1 merge, and live intake activation remain pending separate approval. Owner PIN/MFA replacement recovery is intentionally unavailable until a separately reviewed recovery process exists.

## Validation and limits

- 63 backend authentication/owner tests and 28 frontend regression tests passed; frontend TypeScript check passed. Baseline (37) and verification/escalation (61) regressions also passed.
- Vite bundle build passed with `resolve.preserveSymlinks=true` supplied only to the verification invocation. The ordinary build encountered a sandbox Windows `realpath` EPERM; source build configuration was unchanged.
- Owner tests cover denial, PIN/OTP lockout, replay/concurrent requests, expiry, wrong session, superseded challenges, PIN-change invalidation, initial setup, provider failures, CSRF, and direct API bypass attempts.
- Migration and owner SQL were additionally executed in a disposable local PGlite PostgreSQL engine ([API reference](https://pglite.dev/docs/api)), with 14 checks passing: checkpoint dump/restore, 005 duplicate-email rollback, preservation, password-only accounts and uniqueness, missing 005 runtime grants, 006 scoped grants, repeatability, runtime DDL/audit denial, owner entry, replay and session rejection, logout cascades, single-owner uniqueness, and OTP/TOTP initial PIN setup. This is synthetic local evidence, not a production checkpoint or a rehearsal against a copy of production data. Its single-session execution does not validate multi-connection locking on Neon.
- Live provider delivery and signed-in browser entry remain unverified because owner setup and provider credentials are unavailable/unapproved. Legacy multi-connection database suites and Playwright browser suites require a separately provisioned isolated database/browser test environment; no development or production credentials were used for regression tests.
- No merge, deployment, production migration, real owner bootstrap, or intake activation was performed. The existing Owner implementation is being committed and pushed to stage-4.2 under the continuation authorization; no separate implementation was created.

## Continuation checkpoint

- Preserved all 19 initially changed files and SHA-256 hashes outside the repository at `C:\Users\sures\.codex\.chatgpt-projects\g-p-6ac879c230608191973f009abb6bacc3\checkpoints\aegis-owner-20261012`. No changes were discarded. This source checkpoint is separate from the unavailable production database checkpoint.
- Requested and received explicit write access for the repository and `.git`; staging now succeeds. Commit/push verification is recorded in the consolidated chat report.
- Retried the exact production branch lookup. Neon still rejected `icy-dust-49902301` because its connection remains scoped to `sparkling-dew-62423509`. Production metadata, schema, and restorable checkpoint cannot be independently verified until the connector is reauthorized for production or an independently verified production operator connection is supplied.
- Confirmed locally that Resend credentials, sender/domain configuration, owner identity, OTP HMAC key, and MFA encryption key are missing. The secure email integration is implemented but not configured or live-tested. Do not fabricate keys or select an owner from commit-author details.
- Added `npm run owner:prepare`, a strictly read-only candidate preflight using only a matching production operator URL. It requires explicit owner user ID, email, and Google subject, refuses suspended/mismatched candidates or an existing different owner, and outputs an approval-required designation plan. Running it with the current local connection rejected the target before any database query. It does not execute `admin:bootstrap` or assign a PIN. The existing bootstrap command must not be run until production target, candidate, checkpoint, and separate approval are all verified.
