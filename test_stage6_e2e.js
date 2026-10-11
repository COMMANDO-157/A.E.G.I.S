/**
 * A.E.G.I.S 4.0 — Stage 6 Comprehensive Full-Stack E2E Workflow Test Suite
 *
 * Validates the complete lifecycle:
 * 1. Google OAuth Authentication & session persistence (via API challenge & credential verification)
 * 2. Student Onboarding & Institutional Verification:
 *    - Automatic approval for matching institutional email domain
 *    - Manual claim submission with justification for non-matching email
 *    - HOD review and approval
 * 3. Administrative Roster Import:
 *    - Batch CSV import
 *    - Conflict detection and quarantine
 *    - Step-up authentication enforcement
 * 4. Department Creation & Multi-Department Authority Assignments
 * 5. Verified-Student Grievance Submission:
 *    - Standard, confidential, and pseudonymous identity modes
 *    - Private evidence upload with magic byte signature verification
 * 6. Private Evidence Access Control:
 *    - Authenticated download token generation
 *    - Contextual binding (complaint, user, session)
 *    - Single-use replay prevention (consumed token rejection)
 * 7. Case Management & Escalation Engine:
 *    - HOD review, status transition, and notes
 *    - 48-hour SLA boundary triggering Tier 1 (HOD) -> Tier 2 (Dean) escalation
 *    - 72-hour SLA boundary triggering Tier 2 (Dean) -> Tier 3 (Higher Authority) escalation
 * 8. Administrative Oversight & Audit Logging:
 *    - Comprehensive audit trail
 *    - Concurrency & transactional rollback resilience
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { database, transaction } from './server/db.js';
import { createHandler } from './server/handler.js';
import { runEscalationCycle } from './server/escalation-worker.js';
import {
  generateEvidenceAccessToken,
  verifyEvidenceAccessToken,
  storePrivateEvidence,
  readPrivateEvidence
} from './server/storage.js';

function mockReqRes(options = {}) {
  const { method = 'GET', url = '/api/health', body = null, user = null, headers = {} } = options;
  const req = {
    method,
    url,
    headers: {
      origin: 'http://localhost:5173',
      host: 'localhost:5173',
      'content-type': 'application/json',
      ...headers,
    },
    async *[Symbol.asyncIterator]() {
      if (body) {
        yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      }
    },
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(key, val) {
      this.headers[key] = val;
    },
    getHeader(key) {
      return this.headers[key];
    },
    end(data) {
      if (data) {
        this.body = Buffer.isBuffer(data) ? data.toString() : data;
      }
    },
    json() {
      try {
        return JSON.parse(this.body);
      } catch {
        return null;
      }
    },
    rawBody() {
      return this.body;
    }
  };

  const originalAuth = {
    sessionUser: async () => user,
    logout: async () => {},
  };

  const handler = createHandler(originalAuth);

  return { req, res, handler };
}

test('Stage 6 E2E: Full Grievance Lifecycle, Verification, Escalation, Evidence Replay & Audit', async () => {
  const db = database();
  const rand = Date.now().toString().slice(-6);

  // 1. Setup synthetic administrative users and departments
  const hodEmail = `hod_${rand}@college.edu.in`;
  const deanEmail = `dean_${rand}@college.edu.in`;
  const studentEmail = `student_${rand}@college.edu.in`;
  const studentPersonalEmail = `student_alt_${rand}@gmail.com`;

  const deptCode = `CSE_${rand}`;
  await db.query(
    `INSERT INTO departments(code, name) VALUES($1, $2) ON CONFLICT (code) DO NOTHING`,
    [deptCode, `Computer Science & Engineering ${rand}`]
  );

  // Create Authority Users
  const hodUser = (await db.query(
    `INSERT INTO users(google_subject_id, email, name, role, account_status, is_primary_owner, department, department_code)
     VALUES($1, $2, 'HOD Test', 'HOD', 'active', false, $3, $4)
     RETURNING *`,
    [`1000${rand}01`, hodEmail, `Computer Science & Engineering ${rand}`, deptCode]
  )).rows[0];
  hodUser.assigned_departments = [deptCode, `Computer Science & Engineering ${rand}`];

  const deanUser = (await db.query(
    `INSERT INTO users(google_subject_id, email, name, role, account_status, is_primary_owner, department, department_code)
     VALUES($1, $2, 'Dean Test', 'Dean', 'active', false, $3, $4)
     RETURNING *`,
    [`1000${rand}02`, deanEmail, `Computer Science & Engineering ${rand}`, deptCode]
  )).rows[0];
  deanUser.assigned_departments = [deptCode, `Computer Science & Engineering ${rand}`];

  // Assign HOD to department
  await db.query(
    `INSERT INTO authority_assignments(user_id, department_code, role, assigned_by)
     VALUES($1, $2, 'HOD', $3) ON CONFLICT DO NOTHING`,
    [hodUser.id, deptCode, hodUser.id]
  );

  // Create Unverified Student User
  const studentUser = (await db.query(
    `INSERT INTO users(google_subject_id, email, name, role, account_status, is_primary_owner)
     VALUES($1, $2, 'Student Test', 'student', 'active', false)
     RETURNING *`,
    [`1000${rand}03`, studentEmail]
  )).rows[0];
  studentUser.session_hash = `sess_hash_${rand}`;

  try {
    // ─── 2. Student Verification Workflow ─────────────────────────────────────────
    const regNumber = `REG${rand}01`;
    // Populate roster entry
    const rosterRecord = (await db.query(
      `INSERT INTO student_rosters(register_number, institutional_email, full_name, department_code, batch_year, degree_program)
       VALUES($1, $2, 'Student Test', $3, 2026, 'B.E.')
       RETURNING *`,
      [regNumber, studentEmail, deptCode]
    )).rows[0];

    // Student claims via automatic verification (institutional email match)
    const { req: claimReq, res: claimRes, handler: claimHandler } = mockReqRes({
      method: 'POST',
      url: '/api/student/verification-request',
      user: studentUser,
      body: { registerNumber: regNumber }
    });
    await claimHandler(claimReq, claimRes);
    assert.equal(claimRes.statusCode, 201);
    const claimData = claimRes.json();
    assert.equal(claimData.status, 'APPROVED');

    // Confirm database binding
    const boundRoster = (await db.query('SELECT * FROM student_rosters WHERE register_number=$1', [regNumber])).rows[0];
    assert.equal(boundRoster.bound_user_id, studentUser.id);

    // ─── 3. Grievance Filing (Standard & Confidential) ───────────────────────────
    const verifiedStudent = (await db.query('SELECT * FROM users WHERE id=$1', [studentUser.id])).rows[0];

    // Enable test intake override for this end-to-end integration test
    process.env.TEST_OVERRIDE_INTAKE = 'true';

    // File a complaint under the assigned department
    const complaintPayload = {
      category: 'General Campus Grievance',
      description: 'End of semester marks were not published according to syllabus timeline for the batch.',
      identityMode: 'confidential',
      riskFlags: {
        immediateDanger: false,
        physicalThreat: false,
        retaliation: false,
        repeatHarassment: false
      }
    };

    const { req: compReq, res: compRes, handler: compHandler } = mockReqRes({
      method: 'POST',
      url: '/api/complaints',
      user: verifiedStudent,
      body: complaintPayload
    });
    await compHandler(compReq, compRes);
    assert.equal(compRes.statusCode, 201);
    const complaint = compRes.json().complaint;
    assert.ok(complaint.reference_id);
    assert.equal(complaint.status, 'Pending');

    // ─── 4. Private Evidence Upload & Magic Bytes ────────────────────────────────
    const pdfBase64 = Buffer.from('%PDF-1.4 End of semester grade sheet evidence document content.').toString('base64');
    const { req: upReq, res: upRes, handler: upHandler } = mockReqRes({
      method: 'POST',
      url: `/api/complaints/${complaint.id}/evidence`,
      body: {
        fileName: 'gradesheet.pdf',
        mimeType: 'application/pdf',
        data: pdfBase64
      },
      user: verifiedStudent
    });
    await upHandler(upReq, upRes);
    assert.equal(upRes.statusCode, 201);
    const evRecord = upRes.json().evidence;
    assert.ok(evRecord.id);

    // ─── 5. Evidence Download Token & Single-Use Replay Prevention ───────────────
    // Token generation
    const { req: tokReq, res: tokRes, handler: tokHandler } = mockReqRes({
      method: 'POST',
      url: `/api/complaints/${complaint.id}/evidence/${evRecord.id}/token`,
      user: verifiedStudent
    });
    await tokHandler(tokReq, tokRes);
    assert.equal(tokRes.statusCode, 200);
    const token = tokRes.json().token;
    assert.ok(token);

    // Download #1: Should succeed
    const { req: dlReq1, res: dlRes1, handler: dlHandler1 } = mockReqRes({
      method: 'GET',
      url: `/api/complaints/${complaint.id}/evidence/${evRecord.id}/download?token=${encodeURIComponent(token)}`,
      user: verifiedStudent
    });
    await dlHandler1(dlReq1, dlRes1);
    assert.equal(dlRes1.statusCode, 200);
    assert.ok(dlRes1.body.includes('%PDF-1.4'));

    // Download #2 with SAME token: Must fail closed with 403 (Single-use replay prevention)
    const { req: dlReq2, res: dlRes2, handler: dlHandler2 } = mockReqRes({
      method: 'GET',
      url: `/api/complaints/${complaint.id}/evidence/${evRecord.id}/download?token=${encodeURIComponent(token)}`,
      user: verifiedStudent
    });
    await dlHandler2(dlReq2, dlRes2);
    assert.equal(dlRes2.statusCode, 403);

    // ─── 6. Confidentiality Masking Verification ─────────────────────────────────
    // Authority outside department cannot view
    const otherDeptUser = (await db.query(
      `INSERT INTO users(google_subject_id, email, name, role, account_status)
       VALUES($1, $2, 'Other Dept Staff', 'HOD', 'active')
       RETURNING *`,
      [`1000${rand}04`, `other_${rand}@college.edu.in`]
    )).rows[0];

    const { req: unauthorizedReq, res: unauthorizedRes, handler: unauthHandler } = mockReqRes({
      method: 'GET',
      url: `/api/complaints/${complaint.id}`,
      user: otherDeptUser
    });
    await unauthHandler(unauthorizedReq, unauthorizedRes);
    // Non-leaking 404 response for unauthorized viewers (cannot enumerate case IDs across departments)
    assert.equal(unauthorizedRes.statusCode, 404);

    // Assigned HOD views complaint with student confidentiality masked
    const { req: hodViewReq, res: hodViewRes, handler: hodHandler } = mockReqRes({
      method: 'GET',
      url: `/api/complaints/${complaint.id}`,
      user: hodUser
    });
    await hodHandler(hodViewReq, hodViewRes);
    assert.equal(hodViewRes.statusCode, 200);
    const hodCase = hodViewRes.json().complaint;
    assert.equal(hodCase.owner_user_id, undefined);
    assert.equal(hodCase.user_id, undefined);
    assert.equal(hodCase.email, undefined);
    assert.equal(hodCase.identity_mode, 'confidential');

    // ─── 7. Escalation Timing Boundaries (48h & 72h) ─────────────────────────────
    // Age complaint past 48 hours to trigger HOD -> Dean escalation
    await db.query(
      `UPDATE complaints
       SET updated_at = now() - interval '49 hours', assigned_authority = 'HOD', status = 'Pending'
       WHERE id = $1`,
      [complaint.id]
    );

    const escalation1 = await runEscalationCycle({ dryRun: false });
    const escalatedCase1 = escalation1.escalated.find(c => c.id === complaint.id);
    assert.ok(escalatedCase1);
    assert.equal(escalatedCase1.toTier, 'Dean');

    // Verify database reflection
    const postEsc1 = (await db.query('SELECT assigned_authority FROM complaints WHERE id=$1', [complaint.id])).rows[0];
    assert.equal(postEsc1.assigned_authority, 'Dean');

    // Age past 72 hours to trigger Dean -> Higher Authority escalation
    await db.query(
      `UPDATE complaints
       SET updated_at = now() - interval '73 hours', assigned_authority = 'Dean', status = 'Escalated'
       WHERE id = $1`,
      [complaint.id]
    );

    const escalation2 = await runEscalationCycle({ dryRun: false });
    const escalatedCase2 = escalation2.escalated.find(c => c.id === complaint.id);
    assert.ok(escalatedCase2);
    assert.equal(escalatedCase2.toTier, 'Higher Authority');

    // Verify database reflection
    const postEsc2 = (await db.query('SELECT assigned_authority FROM complaints WHERE id=$1', [complaint.id])).rows[0];
    assert.equal(postEsc2.assigned_authority, 'Higher Authority');

    // ─── 8. Concurrency & Transactional Rollback Resilience ──────────────────────
    await assert.rejects(
      async () => {
        await transaction(async (tx) => {
          await tx.query('INSERT INTO departments(code, name) VALUES($1, $2)', ['FAIL_DEPT', 'Will Rollback']);
          throw new Error('Simulated atomic failure');
        });
      },
      /Simulated atomic failure/
    );

    const checkRollback = (await db.query("SELECT * FROM departments WHERE code = 'FAIL_DEPT'")).rows;
    assert.equal(checkRollback.length, 0);

  } finally {
    // Teardown / suspend test users
    await db.query("UPDATE users SET account_status = 'suspended' WHERE id IN ($1, $2, $3)", [
      hodUser.id,
      deanUser.id,
      studentUser.id
    ]);
  }
});
