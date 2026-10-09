# A.E.G.I.S Stage 3.3 setup and verified limits

The original four fictional demo routes remain available. Authenticated portals use
private server APIs and PostgreSQL; demo localStorage never authenticates accounts.

## Actual integration state
A dedicated Neon PostgreSQL 18 database named aegis was created in the connected
COMMAND X project (sparkling-dew-62423509), on its existing production branch.
No CloudSentry tables or credentials were reused. Both migrations were applied.
The runtime role aegis_runtime has limited application-table permissions and no
superuser, database-creation or role-creation rights. The migration operator uses a
separate trusted owner connection. Never deploy MIGRATION_DATABASE_URL to Vercel.

The client TLS connection was verified with certificate authorization. Neon
terminates client TLS at its proxy, so pg_stat_ssl on the internal backend alone
does not establish client transport security. scripts/health.js checks the actual
client TLS socket and all nine application tables.

DATABASE_URL is stored in ignored local .env and as a sensitive Vercel production
variable. APP_ORIGIN=https://aegis-command-x.vercel.app and LIVE_INTAKE_ENABLED=false
are configured in Vercel. GOOGLE_CLIENT_ID is not available.
Production intake remains locked OFF in code. Setting the activation flag alone
does not unlock production intake. No Google login success is claimed.

## Google client: external account action still required
The connected tools cannot administer Google Cloud OAuth clients, and no local
authenticated gcloud CLI is available. In Google Cloud Console > Google Auth
Platform, create/select the A.E.G.I.S project, configure branding/audience, then
create a Web application client. Add these authorized JavaScript origins:
- https://aegis-command-x.vercel.app
- http://localhost
- http://localhost:5501

Set the actual client ID as GOOGLE_CLIENT_ID in local .env and Vercel settings.
The existing GIS JavaScript callback posts the ID token as same-origin JSON to
/api/auth/google with a single-use server nonce. No redirect URI or client secret
is required for this callback flow. Use permitted test accounts if the consent
screen is in testing. A client ID is public configuration, not an administrator grant.
Never assign authority/admin privileges using an email address alone.

## Local commands
Node.js 22.7+; npm install.
Copy .env.example to .env for a new installation and supply actual credentials.
DATABASE_URL: restricted runtime connection.
MIGRATION_DATABASE_URL: trusted migration owner connection, local operator only.
APP_ORIGIN=http://localhost:5501 and PORT=5501.
DATABASE_SSL=true; false is allowed only for trusted local PostgreSQL.
CRON_SECRET: random secret of at least 32 characters, stored server-side only.
LIVE_INTAKE_ENABLED=false until integration testing. The flag permits local testing
only when valid real configuration is present.
Run npm run migrate, npm run db:health, then npm start.
Open http://localhost:5501; file:// and static Python hosting serve only the demo.

Migrations run under a transaction and advisory lock. Applied files are tracked by
checksum; do not edit an already applied migration, add a new numbered SQL file.
Bootstrap an administrator only through a trusted operator:
npm run admin:bootstrap -- <verified-google-subject-id>
The account must already exist after real Google login. Bootstrap and later role
changes revoke that account's sessions. New Google accounts always start as students.

## Shared rate protection and maintenance
Limits are stored and updated atomically in PostgreSQL, shared across server instances:
- Login challenges: global 120/minute.
- Google token attempts: global 60/minute.
- Session lookup: global 1200/minute.
- Authenticated account: 240 reads/minute and 30 writes/minute.
- Logout: global 240/minute; health: global 120/minute.
No untrusted forwarded-IP header or in-memory counter is used.
These conservative global limits need tuning for institutional traffic. They do
not replace platform-level denial-of-service protection. Database/limiter failure
rejects the request. Rejection returns 429 and Retry-After.

npm run security:cleanup removes up to 1000 expired sessions, login challenges and
rate buckets per run, retaining active records. Repeat for a large backlog.
GET /api/maintenance provides the same cleanup for a trusted scheduler, requiring
Authorization: Bearer <CRON_SECRET>. It never accepts cookie authentication.
The route and local CLI are implemented and tested; no production recurring job
or production CRON_SECRET has been configured. Configure a trusted schedule and
secret before enabling real intake. Never put the secret in a URL or browser code.

## Verification
node test_auth.js
node test_baseline.js
node test_verification.js
node test_cinematic.js (existing external Playwright/Chromium requirement)
npm run test:integration
git diff --check

The PostgreSQL integration suite uses clearly fictional accounts and incidents
inside a rollback transaction, executing under the restricted runtime role.
The concurrent rate-limit test uses independent live connections and removes
only its own unique synthetic rate bucket. No real student data is created.
Tests verify ownership, tier/department scope, administrator restrictions, linking,
escalation, private internal notes, review transitions, session expiry/revocation,
CSRF, maintenance and shared quotas. They do not prove a real Google sign-in.

## Deployment and remaining blockers
The existing Vercel Git integration deploys main automatically. The previous
Stage 3.2 commit was verified READY. No manual production deployment or intake
activation is needed or authorized by merely configuring environment values.
Security headers allow the official Google GIS script and popup flow. Server,
migration and operator-script paths are blocked from static public access.
The public health endpoint reveals only availability and intake status.

Before unlocking production: configure the real Google Web client, exercise its
signed ID tokens and browser popup/session flow, verify real student/staff/admin
accounts with PostgreSQL, configure maintenance scheduling, check deployment
headers and cookies, and obtain explicit activation approval.
Institutional enrollment validation, private evidence storage, malware scanning
and retention controls remain incomplete. Google verification is not enrollment.
Evidence uploads/downloads are unavailable; evidence authenticity confirmation
is rejected until private evidence review exists. Metadata is not secure upload.
Anonymous display remains account-linked in the database. Internal notes are
restricted to authorized staff/admin. No production certification or emergency
dispatch is claimed. Existing HOD > Dean > Higher Authority rules are preserved.
