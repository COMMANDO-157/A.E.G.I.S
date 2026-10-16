# Independent verification foundation — activation proposal

Status: technical proposal for review, not institutional approval. G11 STRICT HOLD.

The Phase 1.3 source denies infrastructure-Owner enrollment decisions and requires a separately recorded, current, exact institution/department/cohort appointment and independent claim-specific conflict clearance for manual decisions. Existing administrative permission and fresh step-up remain necessary but insufficient. Academic titles and active academic assignments confer no such power; incompatible assignments fail closed pending policy approval.

## Schema proposal and custody

`proposals/008_verification_governance_PROPOSAL.sql` is intentionally outside `migrations/`. The normal migration runner will not discover it. It creates empty appointment/clearance tables and mutation-lock triggers; it creates no roles, grants, appointments, clearances or retention schedule. It has been exercised only in disposable PostgreSQL with synthetic rows. Historical migrations 001–007 remain unchanged.

Any later promotion into a numbered migration requires another reviewed change and explicit authorization. Do not apply this file to a shared environment merely because local tests passed.

The application needs SELECT only on the proposed tables. It must not INSERT, UPDATE, DELETE, TRUNCATE, own the tables or disable their triggers. A separately controlled institutional custodian must manage appointment and clearance evidence through a future approved process. Both normal decisions and proposal-table mutation triggers use the same transaction-scoped actor lock, avoiding runtime UPDATE grants for row locking. Trigger absence/disablement denies decisions. Arbitrary privileged DDL/operator access remains a separate security boundary; this protocol does not certify deployed privileges.

## Decisions that block institutional activation

| Blocker | Concrete resolution required |
|---|---|
| Appointing authority | Identify who may appoint/revoke officers, how appointment evidence is independently validated, and who audits that authority. No Owner-operated appointment endpoint exists in this package. |
| Officer account/role model | Approve the separate staff role or portal and its authentication/step-up provisioning. Current administrative routes are a compatibility transport and require an existing admin account plus explicit appointment; this package creates no role or account and does not make ordinary admin permission sufficient. |
| Scope and duration | Approve institution/department/cohort representation, start/end rules, renewal, overlaps and the proposed 180-day limit. Source requires finite expiry but does not silently choose a maximum, auto-renewal or wildcard scope. Overlapping current authority is denied. |
| Conflict clearance custody | Approve who can record independent clearance, the authoritative conflict source, review freshness/expiry, freeze/recusal/restoration and alternate coverage. UNKNOWN, missing, expired, revoked or conflicted clearance denies a decision. The reviewer and enrollment subject cannot clear their own conflict status. No confidential grievance content is copied into these tables or the verification console. |
| Appeals and reconciliation | Appoint independent appeal/reconciliation functions and approve evidence/notice procedures. Legacy Owner approval and revocation endpoints are disabled; this package does not replace them with an unapproved override or automatically alter existing enrollment. |
| Registry provenance | Approve authoritative roster ingestion, institution-domain custody and separation from infrastructure control. Existing institution/roster administration remains a distinct trust boundary; the manual-decision guard does not establish independent provenance of all existing registry records. |
| Deployment privileges | Inspect actual runtime/operator identity, inheritance, table/function/default privileges, trigger custody and protected service access. No production grant or role is inferred from the synthetic test role. |

## Proposed next package

After those decisions are recorded, prepare a separately authorized appointment-custody service and scoped officer portal, approve a forward migration and least-privilege manifest, and rehearse revocation, conflict freezes, appeals and recovery in an isolated environment. Keep authoring appointments and conflict clearances outside ordinary application-runtime credentials. Do not add arbitrary self-attested HTTP conflict fields to bypass the authoritative clearance record.

Historical identity reconciliation needs a separate authorization for restricted real-data access, independent registrar/provider evidence, classification review, student notice/appeal and any corrective transaction. The current audit CLI accepts only its built-in synthetic fixture; it cannot read a database or an uploaded account export. Its indicators do not establish fraud or authorize revocation.

## Compatibility and release boundary

On existing schemas 006/007 without the proposal tables/triggers, manual verification fails closed. Google/password account sign-in and previously valid enrollment access do not acquire a new officer requirement. Fresh authoritative institutional-roster matching remains separate from manual review; consumer Gmail domains cannot confer automatic enrollment even if configured as trusted. A personal Gmail account may still obtain enrollment only through independent authoritative evidence, not mailbox ownership alone.

No maximum delegation lease, retention period, institutional appointment, disclosure power, general student-services workflow or well-being capability is approved here. C1–C6 and UD1–UD8 remain separate architecture/policy decisions. G11 remains STRICT HOLD.
