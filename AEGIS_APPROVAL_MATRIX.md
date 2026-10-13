# AEGIS Approval Matrix

Version 1.0 · Updated 13 October 2026 · Asia/Calcutta (IST)

---

## Production Gate Definitions & Status

| Gate | Title | Target Scope | Pre-Conditions | Status | Approver / Custodian |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **G00** | Master Execution Plan & Ledger | Repository Planning | Complete architecture review | **APPROVED** | Engineering / Security |
| **G01** | Production Baseline Inspection | Neon Control Plane & DB | Verified credentials, read-only transaction | **APPROVED** | Operator |
| **G02** | Production Migrations 005 & 006 | Neon PostgreSQL 18.6 | Checkpoint verified, direct host, 001–004 intact | **EXECUTED** | Operator |
| **G03** | Server Secrets Configuration | Environment Secret Store | P0/P1 complete, key custody established | **IN PROGRESS** | Security Custodian |
| **G04** | PR #1 Branch Merge | Git Remote (main) | G03 ready, clean test run, CI green | **HOLD** | Engineering Lead |
| **G05** | Production Deployment (Intake Disabled) | Vercel Production | G04 merged, rollback commit verified | **HOLD** | Platform Operator |
| **G06** | Human Candidate Sign-in | Google OAuth (Production) | Deployed origin, user identified | **HOLD** | Designated Owner |
| **G07** | Exact Primary Owner Designation | Neon Production DB | Read-only preparation verified, single owner lock | **HOLD** | System Authority |
| **G08** | Live Owner Setup & OTP Test | Resend API & Owner Portal | Designation complete, bounded test attempts | **HOLD** | Designated Owner |
| **G09** | Maintenance Cron Activation | Schedulers / Vercel Cron | `CRON_SECRET` configured, batch limits verified | **HOLD** | Platform Operator |
| **G10** | Live Intake Activation | `LIVE_INTAKE_ENABLED=true` | G01–G09 verified, institutional sign-off | **HOLD** | Executive Leadership |
| **G11** | Post-Launch Acceptance | Service Operation | 24h/7d monitoring clean | **HOLD** | Institutional Stakeholders |
