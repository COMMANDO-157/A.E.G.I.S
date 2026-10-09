# Stage 3.0 setup and limits
The original four demo routes and browser-only synthetic records remain unchanged.
The new #student, #authority and #admin routes use private server APIs exclusively.
They never use demo localStorage for authentication or live complaint persistence.

## Database provider
CloudSentry package metadata confirmed PostgreSQL through node-postgres (pg), with
Neon-related tooling present. The hosted provider called "Nemo" was not conclusively
confirmed. This implementation accepts standard PostgreSQL, including Neon.
No prior-project database or credentials have been copied or connected.

## Local setup
1. Node.js 22.7+; run npm install (two runtime packages: pg, google-auth-library).
2. Create a dedicated PostgreSQL database. Copy .env.example to .env, then supply
   DATABASE_URL, GOOGLE_CLIENT_ID, APP_ORIGIN=http://localhost:5501 and PORT=5501.
   Use TLS with certificate validation; DATABASE_SSL=false is local-only.
3. Register a Google OAuth Web client and authorize the exact JavaScript origin.
   No Google client secret is needed for the verified Google Identity Services ID
   token sign-in flow. Google verifies identity; it does not assign staff roles.
4. Run npm run migrate, then npm start. Open http://localhost:5501.
5. Sign in first; new accounts always start as students. To assign the first admin,
   a trusted operator runs npm run admin:bootstrap -- <verified-google-subject-id>
   against that existing account. Obtain the subject ID via the trusted database
   console, not an unverified email. Admins approve staff and assign departments.
6. On Vercel, configure the same server environment values with the actual HTTPS
   origin. A route adapter is supplied; deployment was not performed or tested.

The static python HTTP server remains suitable for the synthetic demo only.
Authenticated portals show an unavailable/configuration message with static hosting.

## Verification
node test_baseline.js
node test_verification.js
node test_cinematic.js (existing external Playwright/Chromium requirement)
node --test test_auth.js
git diff --check

## Privacy and incomplete infrastructure
Opaque session tokens are hashed in PostgreSQL; browser cookies are HttpOnly,
SameSite=Strict, and Secure on HTTPS. Login nonces are single-use database records.
Every sensitive API request checks an active account; mutations check request origin.
Students may link only their own reports. Authorities are scoped by tier and department.
Higher Authority reviews all tiers. Staff/admin permissions never come from request roles.
Role changes invalidate the target's sessions. Administrator grants are CLI-only.

"Anonymous" signed-in reporting means staff display anonymity, not unlinkability from
the account/database or system operators. Internal reviewer reasons are not returned
to students. Evidence is metadata-only at schema level; uploads/downloads are disabled.
Private object storage, malware scanning, retention policies and institutional identity
matching are still required. Google email verification is not proof of student enrollment.

Identity, evidence authenticity and human allegation findings are distinct fields.
No rule automatically declares an allegation true or false. Resolution verification is
separate from the existing case status workflow. Reviewers must supply reasons.

Before real records: apply and inspect the migration in a dedicated DB, verify live
Google login and production origin/cookies, exercise real student isolation and staff
scoping against PostgreSQL, implement distributed rate limiting and challenge/session
cleanup, provision private evidence storage, and perform a security review. No live
connection, production security certification, or emergency dispatch is claimed.

## Stage 3.2 activation gate and configuration
Authenticated intake is OFF by default. Production intake is code-locked OFF until the blockers below are resolved;
LIVE_INTAKE_ENABLED=true only permits local integration testing. /api/config reports ready:false
and no login challenge, session lookup or complaint API is available while disabled.
Logout remains available with exact Origin and JSON checks; it clears malformed
cookies and revokes well-formed session tokens even after expiration.
The original synthetic demo routes continue to work without backend configuration.

Production APP_ORIGIN must be exactly https://aegis-command-x.vercel.app
(no path, query or fragment). PostgreSQL uses TLS with certificate verification;
URL ssl* parameters are removed so they cannot override the explicit TLS setting.
DATABASE_SSL=false is rejected in production and for remote databases.
Do not use NODE_TLS_REJECT_UNAUTHORIZED=0.

Neon is compatible, but the earlier provider identity is unconfirmed. Create a
dedicated PostgreSQL/Neon database and store its actual connection string only in
local .env or Vercel encrypted environment settings. Never reuse another app's DB.
Run npm run migrate against the dedicated database; the migration is idempotent.
No migration or live connection has been executed here.

Create a Google OAuth Web application client. Authorized JavaScript origins:
https://aegis-command-x.vercel.app and http://localhost:5501 for local development.
The existing GIS JavaScript callback sends credential to /api/auth/google using
same-origin JSON, bound to a single-use server nonce. It uses no redirect callback
and needs no Google client secret. Configure GOOGLE_CLIENT_ID server-side.
APP_ORIGIN, DATABASE_URL and GOOGLE_CLIENT_ID are mandatory.
Do not enable intake merely because these three values exist.

DEPLOYMENT BLOCKERS FOR REAL INTAKE:
- Shared/distributed rate limiting has NOT been implemented; no in-memory substitute.
- Live Google signature/login, PostgreSQL migration, ownership, department/tier and
  role revocation must be tested against real dedicated services.
- Expired session/challenge cleanup needs a trusted scheduled mechanism.
- Institutional enrollment checks and private evidence storage remain incomplete.
Focused auth tests use injected database responses; they are local contract tests,
not proof of PostgreSQL transaction behavior or live Google validation.
Keep LIVE_INTAKE_ENABLED=false until these blockers are addressed and activation
is explicitly approved. No production-ready claim is made.
