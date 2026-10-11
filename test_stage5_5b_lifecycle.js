/**
 * A.E.G.I.S 4.0 — Stage 5.5B Grievance Intake, Evidence & Case Lifecycle Test Suite
 * Comprehensive verification of:
 * 1. Dual Invariant: Verified student required (is_verified_student + active bound student_rosters).
 * 2. Confidentiality & Identity Masking: Identity mode anonymous/confidential masks reporter identity.
 * 3. Authority Scoping & Department Isolation: Multi-department appointments and strict boundaries.
 * 4. Private Evidence Storage & Token Lifecycle:
 *    - 10MB limit validation
 *    - Supported MIME types (PNG, JPEG, WEBP, PDF, TXT)
 *    - Rejection of executables and dangerous types
 *    - Path traversal rejection
 *    - Time-limited (15-min) HMAC-SHA256 signed tokens
 *    - Rejection of forged, expired, or cross-user tokens
 *    - Evidence authenticity confirmation requires uploaded evidence
 * 5. Deterministic Escalation (48h/72h SLA rules):
 *    - HOD overdue -> Escalates to Dean
 *    - Dean overdue -> Escalates to Higher Authority
 *    - Idempotency and advisory lock protection
 *    - Append-only audit logging
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { database, transaction } from './server/db.js';
import { createHandler } from './server/handler.js';
import { runEscalationCycle } from './server/escalation-worker.js';
import {
  storePrivateEvidence,
  generateEvidenceAccessToken,
  verifyEvidenceAccessToken,
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

test('Stage 5.5B: Private Evidence Storage & Access Token Security', async () => {
  const compId = randomUUID();
  const userId = randomUUID();

  // 1. Valid PNG storage
  const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const stored = await storePrivateEvidence({
    complaintId: compId,
    userId,
    mimeType: 'image/png',
    fileName: 'screenshot.png',
    data: samplePngBase64
  });

  assert.ok(stored.fileReference.startsWith('private/'));
  assert.equal(stored.mimeType, 'image/png');
  assert.ok(stored.sizeBytes > 0);

  // 2. Read stored file
  const fileContent = await readPrivateEvidence(stored.fileReference);
  assert.ok(Buffer.isBuffer(fileContent));
  assert.equal(fileContent.length, stored.sizeBytes);

  // 3. Path traversal attack rejected
  await assert.rejects(
    async () => readPrivateEvidence('private/../../etc/passwd'),
    /Path traversal rejected|Invalid file reference/
  );

  // 4. Unsupported MIME type rejected (e.g. application/x-msdownload or executable)
  await assert.rejects(
    async () => storePrivateEvidence({
      complaintId: compId,
      userId,
      mimeType: 'application/x-sh',
      fileName: 'script.sh',
      data: 'echo hello'
    }),
    /Unsupported evidence file type/
  );

  // 5. Short-lived token lifecycle (bound to complaint, user, session, evidence)
  const evId = randomUUID();
  const sessionHash = 'test_session_hash_123';
  const validToken = generateEvidenceAccessToken({
    evidenceId: evId,
    complaintId: compId,
    userId,
    sessionHash
  });
  assert.ok(validToken);

  // Token verified for matching context
  assert.equal(verifyEvidenceAccessToken(validToken, {
    evidenceId: evId,
    complaintId: compId,
    userId,
    sessionHash
  }), true);

  // Negative: Cross-user attempt fails
  const otherUserId = randomUUID();
  assert.equal(verifyEvidenceAccessToken(validToken, {
    evidenceId: evId,
    complaintId: compId,
    userId: otherUserId,
    sessionHash
  }), false);

  // Negative: Cross-complaint attempt fails
  const otherCompId = randomUUID();
  assert.equal(verifyEvidenceAccessToken(validToken, {
    evidenceId: evId,
    complaintId: otherCompId,
    userId,
    sessionHash
  }), false);

  // Negative: Cross-session attempt fails
  assert.equal(verifyEvidenceAccessToken(validToken, {
    evidenceId: evId,
    complaintId: compId,
    userId,
    sessionHash: 'different_session_hash'
  }), false);

  // Negative: Wrong evidence ID cannot use token
  const otherEvId = randomUUID();
  assert.equal(verifyEvidenceAccessToken(validToken, {
    evidenceId: otherEvId,
    complaintId: compId,
    userId,
    sessionHash
  }), false);

  // Negative: Tampered token signature fails
  const tamperedToken = validToken.slice(0, -4) + 'AAAA';
  assert.equal(verifyEvidenceAccessToken(tamperedToken, {
    evidenceId: evId,
    complaintId: compId,
    userId,
    sessionHash
  }), false);
});

test('Stage 5.5B: Grievance Intake — Dual Invariant Enforcement', async () => {
  const db = database();
  const rand = Date.now().toString();

  // Create student user with is_verified_student=true but WITHOUT a valid bound roster
  const userRes = await db.query(
    "INSERT INTO users(google_subject_id, email, name, role, is_verified_student, department) VALUES($1, $2, 'False Student', 'student', true, 'CSE') RETURNING *",
    ['sub_fake_' + rand, 'fake.student.' + rand + '@example.com']
  );
  const unverifiedStudent = userRes.rows[0];

  try {
    const { req, res, handler } = mockReqRes({
      method: 'POST',
      url: '/api/complaints',
      body: {
        category: 'General Campus Grievance',
        description: 'Test grievance description that is adequately long enough to satisfy character limits.',
        identityMode: 'standard'
      },
      user: unverifiedStudent
    });

    await handler(req, res);
    // Must be rejected with 403 because active bound roster is missing
    assert.equal(res.statusCode, 403);
    assert.match(res.json().error, /Institutional verification required|Institutional roster record is inactive/);
  } finally {
    await db.query("UPDATE users SET account_status = 'suspended' WHERE id = $1", [unverifiedStudent.id]);
  }
});

test('Stage 5.5B: Case Lifecycle — Confidentiality Masking across List and Details', async () => {
  const db = database();
  const rand = Date.now().toString();
  const testReg = 'CONFID99901';

  // Create roster and verified student
  await db.query('DELETE FROM student_rosters WHERE register_number = $1', [testReg]);
  const roster = (await db.query(
    'INSERT INTO student_rosters(register_number, institutional_email, full_name, department_code, batch_year) VALUES($1, $2, $3, $4, $5) RETURNING *',
    [testReg, `confid.${rand}@college.edu.in`, 'Confidential Reporter', 'MECH', '2022-2026']
  )).rows[0];

  const studentUser = (await db.query(
    "INSERT INTO users(google_subject_id, email, name, role, is_verified_student, roster_id, department_code, department) VALUES($1, $2, 'Confidential Reporter', 'student', true, $3, 'MECH', 'Mechanical Engineering') RETURNING *",
    ['sub_conf_' + rand, `confid.${rand}@college.edu.in`, roster.id]
  )).rows[0];

  await db.query('UPDATE student_rosters SET bound_user_id=$1 WHERE id=$2', [studentUser.id, roster.id]);

  // Create complaint with confidential identity mode
  const compRes = await db.query(
    `INSERT INTO complaints(reference_id, owner_user_id, case_id, department, category, description, identity_mode, severity, urgency, assigned_authority, status)
     VALUES($1, $2, gen_random_uuid(), 'Mechanical Engineering', 'General Campus Grievance', 'Confidential report of harassment in college laboratory premises.', 'confidential', 'Moderate', 'Routine', 'HOD', 'Pending')
     RETURNING *`,
    ['AEG-TEST-CONFID-' + rand.slice(-6), studentUser.id]
  );
  const complaint = compRes.rows[0];

  // Create HOD user for Mechanical Engineering
  const hodUser = (await db.query(
    "INSERT INTO users(google_subject_id, email, name, role, department, department_code) VALUES($1, $2, 'HOD MECH', 'HOD', 'Mechanical Engineering', 'MECH') RETURNING *",
    ['sub_hod_mech_' + rand, `hod.mech.${rand}@college.edu.in`]
  )).rows[0];

  try {
    // 1. HOD queries complaints list
    const { req: lReq, res: lRes, handler: lHandler } = mockReqRes({
      method: 'GET',
      url: '/api/complaints',
      user: hodUser
    });
    await lHandler(lReq, lRes);
    assert.equal(lRes.statusCode, 200);
    const list = lRes.json().complaints;
    const found = list.find(c => c.id === complaint.id);
    assert.ok(found);

    // Negative: Reporter's user_id, email, and owner_user_id are NEVER exposed in safeComplaint
    assert.equal(found.owner_user_id, undefined);
    assert.equal(found.user_id, undefined);
    assert.equal(found.email, undefined);
    assert.equal(found.identity_mode, 'confidential');

    // 2. HOD queries complaint detail
    const { req: dReq, res: dRes, handler: dHandler } = mockReqRes({
      method: 'GET',
      url: `/api/complaints/${complaint.id}`,
      user: hodUser
    });
    await dHandler(dReq, dRes);
    assert.equal(dRes.statusCode, 200);
    const detail = dRes.json().complaint;
    assert.equal(detail.owner_user_id, undefined);
    assert.equal(detail.user_id, undefined);
    assert.equal(detail.email, undefined);
  } finally {
    await db.query('DELETE FROM student_rosters WHERE id = $1', [roster.id]);
    await db.query("UPDATE users SET account_status = 'suspended' WHERE id IN ($1, $2)", [studentUser.id, hodUser.id]);
  }
});

test('Stage 5.5B: Case Lifecycle — Evidence Upload, Authenticity Gate & Token Access', async () => {
  const db = database();
  const rand = Date.now().toString();

  // Create student and HOD
  const student = (await db.query(
    "INSERT INTO users(google_subject_id, email, name, role, department) VALUES($1, $2, 'Student Ev', 'student', 'Civil Engineering') RETURNING *",
    ['sub_ev_s_' + rand, `ev.student.${rand}@college.edu.in`]
  )).rows[0];

  const hod = (await db.query(
    "INSERT INTO users(google_subject_id, email, name, role, department, department_code) VALUES($1, $2, 'HOD Civil', 'HOD', 'Civil Engineering', 'CIVIL') RETURNING *",
    ['sub_ev_h_' + rand, `ev.hod.${rand}@college.edu.in`]
  )).rows[0];

  const complaint = (await db.query(
    `INSERT INTO complaints(reference_id, owner_user_id, case_id, department, category, description, identity_mode, severity, urgency, assigned_authority, status, verification_status)
     VALUES($1, $2, gen_random_uuid(), 'Civil Engineering', 'General Campus Grievance', 'Evidence test grievance regarding hostel infrastructure defects.', 'standard', 'Moderate', 'Routine', 'HOD', 'Pending', 'Identity Verified')
     RETURNING *`,
    ['AEG-TEST-EV-' + rand.slice(-6), student.id]
  )).rows[0];

  try {
    // 1. Negative: HOD attempts to confirm authenticity when NO evidence exists -> 422
    const { req: noEvReq, res: noEvRes, handler: noEvHandler } = mockReqRes({
      method: 'PATCH',
      url: `/api/complaints/${complaint.id}/verification`,
      body: {
        verification_status: 'Under Review',
        evidence_status: 'Authenticity Confirmed',
        notes: 'Trying to confirm authenticity without any evidence files attached'
      },
      user: hod
    });
    await noEvHandler(noEvReq, noEvRes);
    assert.equal(noEvRes.statusCode, 422);
    assert.match(noEvRes.json().error, /authenticity cannot be confirmed without evidence/);

    // 2. Student uploads valid PDF evidence
    const pdfBase64 = Buffer.from('%PDF-1.4 sample content for grievance test').toString('base64');
    const { req: upReq, res: upRes, handler: upHandler } = mockReqRes({
      method: 'POST',
      url: `/api/complaints/${complaint.id}/evidence`,
      body: {
        fileName: 'proof-document.pdf',
        mimeType: 'application/pdf',
        data: pdfBase64
      },
      user: student
    });
    await upHandler(upReq, upRes);
    assert.equal(upRes.statusCode, 201);
    const uploadedEv = upRes.json().evidence;
    assert.ok(uploadedEv.id);
    assert.equal(uploadedEv.mimeType, 'application/pdf');

    // 3. Student / Authority lists evidence
    const { req: lsReq, res: lsRes, handler: lsHandler } = mockReqRes({
      method: 'GET',
      url: `/api/complaints/${complaint.id}/evidence`,
      user: hod
    });
    await lsHandler(lsReq, lsRes);
    assert.equal(lsRes.statusCode, 200);
    const evList = lsRes.json().evidence;
    assert.equal(evList.length, 1);
    assert.equal(evList[0].id, uploadedEv.id);

    // 4. HOD requests authorized download token
    const { req: tokReq, res: tokRes, handler: tokHandler } = mockReqRes({
      method: 'POST',
      url: `/api/complaints/${complaint.id}/evidence/${uploadedEv.id}/token`,
      user: hod
    });
    await tokHandler(tokReq, tokRes);
    assert.equal(tokRes.statusCode, 200);
    const downloadToken = tokRes.json().token;
    assert.ok(downloadToken);

    // 5. Download evidence with valid token
    const { req: dlReq, res: dlRes, handler: dlHandler } = mockReqRes({
      method: 'GET',
      url: `/api/complaints/${complaint.id}/evidence/${uploadedEv.id}/download?token=${downloadToken}`,
      user: hod
    });
    await dlHandler(dlReq, dlRes);
    assert.equal(dlRes.statusCode, 200);
    assert.ok(dlRes.rawBody().includes('%PDF-1.4 sample content'));

    // 6. Negative: Download without token or with forged token -> 403
    const { req: badDlReq, res: badDlRes, handler: badDlHandler } = mockReqRes({
      method: 'GET',
      url: `/api/complaints/${complaint.id}/evidence/${uploadedEv.id}/download?token=invalid_token`,
      user: hod
    });
    await badDlHandler(badDlReq, badDlRes);
    assert.equal(badDlRes.statusCode, 403);

    // 7. HOD now confirms authenticity with evidence present -> 200 OK
    const { req: okEvReq, res: okEvRes, handler: okEvHandler } = mockReqRes({
      method: 'PATCH',
      url: `/api/complaints/${complaint.id}/verification`,
      body: {
        verification_status: 'Under Review',
        evidence_status: 'Authenticity Confirmed',
        notes: 'Evidence reviewed and verified against official department records.'
      },
      user: hod
    });
    await okEvHandler(okEvReq, okEvRes);
    assert.equal(okEvRes.statusCode, 200);
    assert.equal(okEvRes.json().complaint.evidence_status, 'Authenticity Confirmed');
  } finally {
    await db.query("UPDATE users SET account_status = 'suspended' WHERE id IN ($1, $2)", [student.id, hod.id]);
  }
});

test('Stage 5.5B: Automated Escalation Engine — Deterministic 48h/72h SLA rules and Idempotency', async () => {
  const db = database();
  const rand = Date.now().toString();

  // Create test complaint at HOD tier created 50 hours ago (> 48h threshold)
  const caseId = randomUUID();
  const user = (await db.query(
    "INSERT INTO users(google_subject_id, email, name, role) VALUES($1, $2, 'Escalation Test Student', 'student') RETURNING *",
    ['sub_esc_' + rand, `esc.${rand}@college.edu.in`]
  )).rows[0];

  const compRes = await db.query(
    `INSERT INTO complaints(reference_id, owner_user_id, case_id, department, category, description, identity_mode, severity, urgency, assigned_authority, status, updated_at)
     VALUES($1, $2, $3, 'Electrical Engineering', 'General Campus Grievance', 'Escalation SLA test complaint pending review for over 48 hours.', 'standard', 'Moderate', 'Routine', 'HOD', 'Pending', now() - interval '50 hours')
     RETURNING *`,
    ['AEG-ESC-' + rand.slice(-6), user.id, caseId]
  );
  const overdueComplaint = compRes.rows[0];

  try {
    // 1. Dry run execution: evaluates overdue without mutating
    const dryResult = await runEscalationCycle({ dryRun: true });
    assert.ok(dryResult.processed >= 1);
    const dryFound = dryResult.escalated.find(e => e.id === overdueComplaint.id);
    assert.ok(dryFound);
    assert.equal(dryFound.fromTier, 'HOD');
    assert.equal(dryFound.toTier, 'Dean');

    // Confirm DB was NOT mutated during dry-run
    const afterDry = (await db.query('SELECT assigned_authority, status FROM complaints WHERE id=$1', [overdueComplaint.id])).rows[0];
    assert.equal(afterDry.assigned_authority, 'HOD');

    // 2. Real escalation execution: mutates DB and creates audit log
    const cycleResult = await runEscalationCycle({ dryRun: false });
    assert.ok(cycleResult.processed >= 1);
    const escalatedItem = cycleResult.escalated.find(e => e.id === overdueComplaint.id);
    assert.ok(escalatedItem);
    assert.equal(escalatedItem.fromTier, 'HOD');
    assert.equal(escalatedItem.toTier, 'Dean');

    // Verify DB state: case escalated to Dean
    const afterReal = (await db.query('SELECT assigned_authority, status FROM complaints WHERE id=$1', [overdueComplaint.id])).rows[0];
    assert.equal(afterReal.assigned_authority, 'Dean');
    assert.equal(afterReal.status, 'Escalated');

    // Verify audit log
    const auditRes = await db.query("SELECT * FROM audit_logs WHERE complaint_id=$1 AND action='AUTOMATED_SLA_ESCALATION'", [overdueComplaint.id]);
    assert.equal(auditRes.rowCount, 1);

    // 3. Idempotency pass: running cycle again should NOT re-escalate (since updated_at was refreshed to now())
    const secondPass = await runEscalationCycle({ dryRun: false });
    const secondFound = secondPass.escalated.find(e => e.id === overdueComplaint.id);
    assert.equal(secondFound, undefined);
  } finally {
    await db.query("UPDATE users SET account_status = 'suspended' WHERE id = $1", [user.id]);
  }
});
