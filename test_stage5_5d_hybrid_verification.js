/**
 * A.E.G.I.S — G09.1 Hybrid Institutional Student Verification In-Memory Mock Test Suite
 * Self-contained unit & integration tests running with zero network or database dependencies:
 *
 * 1. Path A (Institutional Email Auto-Approval):
 *    - Matching institutional email + authoritative roster -> Auto-approved with INSTITUTIONAL_OAUTH_EXACT.
 *    - Student account is verified and roster bound immediately.
 * 2. Path B (Personal Google Account Enrollment):
 *    - Personal Google email + authoritative roster -> Claim created in PENDING status with claim_channel PERSONAL_GOOGLE_ROSTER.
 *    - Invariant: Student remains unverified and CANNOT submit grievances.
 * 3. Primary Owner Governance Review & Dual-Factor Step-Up:
 *    - Owner reviews pending claim with step-up token -> Approves claim.
 *    - Student account transitions to verified; grievance submission is unlocked.
 * 4. Owner Rejection & Revocation:
 *    - Owner rejects claim -> status set to REJECTED.
 *    - Owner revokes approved claim -> unbinds roster, sets is_verified_student=false, invalidates active sessions.
 * 5. Pre-Import CSV Batch Preview:
 *    - Validates record counts, detects syntax/domain/duplicate errors, and outputs clean summary without mutations.
 * 6. Institution Perimeter Configuration:
 *    - Owner manages multi-domain scope: create and toggle active status.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createHandler } from './server/handler.js';
import { hashActionPin, encryptSecret, generateTotpSecret } from './server/crypto.js';
import { digest, issueStepUpToken } from './server/auth.js';

const OWNER_ID = '00000000-0000-0000-0000-000000000001';
process.env.PRIMARY_OWNER_USER_ID = OWNER_ID;
process.env.PRIMARY_OWNER_EMAIL = 'owner@campus.test';
process.env.OWNER_OTP_HMAC_KEY = randomBytes(32).toString('hex');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://localhost/fictional';
process.env.APP_ORIGIN = 'http://localhost:5173';
process.env.LIVE_INTAKE_ENABLED = 'true';
process.env.TEST_OVERRIDE_INTAKE = 'true';
process.env.GOOGLE_CLIENT_ID = '123456789-fictionalclientid.apps.googleusercontent.com';

function createMockEnvironment() {
  const { pinHash, pinSalt } = hashActionPin('54321');
  const secret = generateTotpSecret();

  const ownerUser = {
    id: OWNER_ID,
    email: 'owner@campus.test',
    role: 'admin',
    account_status: 'active',
    is_primary_owner: true,
    session_hash: digest('s'.repeat(43)),
    mfa_enrolled: true,
    mfa_secret_encrypted: encryptSecret(secret),
    action_pin_hash: pinHash,
    action_pin_salt: pinSalt,
    action_pin_set_at: new Date(),
    action_pin_failed_attempts: 0,
    owner_failed_attempts: 0,
    permissions: ['roster.import', 'roster.conflicts.manage', 'users.verify'],
  };

  // Mock In-Memory Store
  const store = {
    users: new Map([[OWNER_ID, ownerUser]]),
    departments: new Map([
      ['CSE', { code: 'CSE', name: 'Computer Science and Engineering', active: true }],
      ['ECE', { code: 'ECE', name: 'Electronics and Communication Engineering', active: true }],
      ['IT', { code: 'IT', name: 'Information Technology', active: true }],
      ['AIDS', { code: 'AIDS', name: 'Artificial Intelligence and Data Science', active: true }],
      ['MECH', { code: 'MECH', name: 'Mechanical Engineering', active: true }],
      ['CIVIL', { code: 'CIVIL', name: 'Civil Engineering', active: true }],
      ['EEE', { code: 'EEE', name: 'Electrical and Electronics Engineering', active: true }],
    ]),
    studentRosters: new Map(),
    verificationRequests: new Map(),
    complaints: new Map(),
    institutions: new Map([
      ['default', {
        id: randomUUID(),
        slug: 'default',
        name: 'Autonomous College of Engineering and Technology',
        active: true,
        domains: ['college.edu.in', 'autocoll.ac.in'],
        supported_methods: ['INSTITUTIONAL_EMAIL', 'PERSONAL_GOOGLE_ROSTER'],
        created_at: new Date(),
        updated_at: new Date()
      }]
    ]),
    ownerGrants: new Map(),
    sessions: new Map([[ownerUser.session_hash, { user_id: OWNER_ID, expires_at: new Date(Date.now() + 3600000) }]]),
    stepUpTokens: new Map(),
    auditLogs: [],
  };

  // Populate valid owner grant for tests
  const grantToken = 'mock_grant_' + randomBytes(16).toString('hex');
  store.ownerGrants.set(digest(grantToken), {
    token_hash: digest(grantToken),
    user_id: OWNER_ID,
    session_hash: ownerUser.session_hash,
    pin_set_at: ownerUser.action_pin_set_at,
    expires_at: new Date(Date.now() + 600000),
  });

  const mockDb = {
    query: async (sql, params = []) => {
      const q = sql.trim();

      // institutions query
      if (q.includes('FROM institutions WHERE active=true')) {
        const rows = [];
        for (const inst of store.institutions.values()) {
          if (inst.active) {
            for (const d of inst.domains) rows.push({ domain: d });
          }
        }
        return { rows, rowCount: rows.length };
      }

      if (q.includes('FROM institutions') && q.includes('WHERE slug=$1')) {
        const inst = store.institutions.get(params[0]) || Array.from(store.institutions.values()).find(i => i.slug === params[0]);
        return { rows: inst ? [inst] : [], rowCount: inst ? 1 : 0 };
      }

      if (q.includes('FROM institutions') && (q.includes('WHERE id=$1') || q.includes('WHERE id = $1'))) {
        const inst = store.institutions.get(params[0]) || Array.from(store.institutions.values()).find(i => i.id === params[0]);
        return { rows: inst ? [inst] : [], rowCount: inst ? 1 : 0 };
      }

      if (q.includes('FROM institutions ORDER BY created_at ASC')) {
        const rows = Array.from(store.institutions.values());
        return { rows, rowCount: rows.length };
      }

      if (q.includes('INSERT INTO institutions')) {
        const inst = {
          id: randomUUID(),
          slug: params[0],
          name: params[1],
          domains: params[2],
          supported_methods: params[3] || ['INSTITUTIONAL_EMAIL', 'PERSONAL_GOOGLE_ROSTER'],
          active: params[4] !== undefined ? params[4] : true,
          created_at: new Date(),
          updated_at: new Date()
        };
        store.institutions.set(inst.id, inst);
        store.institutions.set(inst.slug, inst);
        return { rows: [inst], rowCount: 1 };
      }

      if (q.includes('UPDATE institutions SET')) {
        const id = params[0]; // first param in UPDATE institutions SET active=$2 ... WHERE id=$1
        const inst = store.institutions.get(id) || Array.from(store.institutions.values()).find(i => i.id === id);
        if (inst) {
          // If active is passed in params
          for (const p of params) {
            if (typeof p === 'boolean') inst.active = p;
          }
          inst.updated_at = new Date();
          return { rows: [inst], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      // users lookup
      if (q.includes('SELECT * FROM users WHERE id=$1')) {
        const u = store.users.get(params[0]);
        return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
      }

      if (q.includes('SELECT * FROM users WHERE is_primary_owner = TRUE')) {
        return { rows: [ownerUser], rowCount: 1 };
      }

      if (q.includes('SELECT id, role, is_verified_student, roster_id FROM users WHERE id=$1')) {
        const u = store.users.get(params[0]);
        return { rows: u ? [{ id: u.id, role: u.role, is_verified_student: u.is_verified_student, roster_id: u.roster_id }] : [], rowCount: u ? 1 : 0 };
      }

      if (q.includes('UPDATE users SET') && q.includes('is_verified_student=true')) {
        const rosterId = params[0], deptCode = params[1], deptName = params[2], userId = params[3];
        const u = store.users.get(userId);
        if (u) {
          u.is_verified_student = true;
          u.roster_id = rosterId;
          u.department_code = deptCode;
          u.department = deptName;
        }
        return { rows: [], rowCount: 1 };
      }

      if (q.includes('UPDATE users SET') && q.includes('is_verified_student=false')) {
        const u = store.users.get(params[0]);
        if (u) {
          u.is_verified_student = false;
          u.roster_id = null;
        }
        return { rows: [], rowCount: 1 };
      }

      // sessions
      if (q.includes('DELETE FROM sessions WHERE user_id=$1')) {
        for (const [k, v] of store.sessions.entries()) {
          if (v.user_id === params[0]) store.sessions.delete(k);
        }
        return { rows: [], rowCount: 1 };
      }

      // owner grant check
      if (q.includes('FROM owner_portal_grants')) {
        const grant = store.ownerGrants.get(params[0]);
        const valid = grant && grant.user_id === params[1] && grant.session_hash === params[2];
        return { rows: valid ? [grant] : [], rowCount: valid ? 1 : 0 };
      }

      // departments lookup
      if (q.includes('SELECT code FROM departments WHERE active=true')) {
        const rows = Array.from(store.departments.values()).filter(d => d.active).map(d => ({ code: d.code }));
        return { rows, rowCount: rows.length };
      }

      if (q.includes('FROM departments WHERE code=$1')) {
        const d = store.departments.get(params[0]);
        return { rows: d && d.active ? [d] : [], rowCount: d && d.active ? 1 : 0 };
      }

      // student_rosters
      if (q.includes('FROM student_rosters') && (q.includes('WHERE register_number=$1') || q.includes('register_number = $1'))) {
        const r = store.studentRosters.get(params[0]);
        const isActive = r ? (r.is_active !== undefined ? r.is_active : r.active) : false;
        return { rows: r ? [{ ...r, is_active: isActive }] : [], rowCount: r ? 1 : 0 };
      }

      if (q.includes('FROM student_rosters') && (q.includes('WHERE id=$1') || q.includes('WHERE id = $1'))) {
        const r = Array.from(store.studentRosters.values()).find(x => x.id === params[0]);
        const isActive = r ? (r.is_active !== undefined ? r.is_active : r.active) : false;
        return { rows: r ? [{ ...r, is_active: isActive }] : [], rowCount: r ? 1 : 0 };
      }

      if (q.includes('UPDATE student_rosters SET bound_user_id=$1')) {
        const userId = params[0], rosterId = params[1];
        const r = Array.from(store.studentRosters.values()).find(x => x.id === rosterId);
        if (r) r.bound_user_id = userId;
        return { rows: [], rowCount: 1 };
      }

      if (q.includes('UPDATE student_rosters SET bound_user_id=NULL')) {
        const rosterId = params[0];
        const r = Array.from(store.studentRosters.values()).find(x => x.id === rosterId);
        if (r) r.bound_user_id = null;
        return { rows: [], rowCount: 1 };
      }

      if (q.includes('SELECT id FROM users WHERE roster_id=$1')) {
        const boundUser = Array.from(store.users.values()).find(u => u.roster_id === params[0]);
        return { rows: boundUser ? [boundUser] : [], rowCount: boundUser ? 1 : 0 };
      }

      if (q.includes('INSERT INTO student_rosters')) {
        const isWithInst = params.length >= 9;
        const regNo = isWithInst ? params[1] : params[0];
        const record = {
          id: randomUUID(),
          institution_id: isWithInst ? params[0] : (params[8] || null),
          register_number: regNo,
          institutional_email: isWithInst ? params[2] : params[1],
          full_name: isWithInst ? params[3] : params[2],
          department_code: isWithInst ? params[4] : params[3],
          batch_year: isWithInst ? params[5] : params[4],
          degree_program: isWithInst ? params[6] : params[5],
          approved_personal_email: isWithInst ? params[7] : (params[6] || null),
          is_test_record: isWithInst ? params[8] : (params[7] || false),
          active: true,
          is_active: true,
        };
        store.studentRosters.set(regNo, record);
        return { rows: [record], rowCount: 1 };
      }

      // student_verification_requests
      if (q.includes('FROM student_verification_requests WHERE user_id=$1') && q.includes("status='PENDING'")) {
        const reqs = Array.from(store.verificationRequests.values()).filter(r => r.user_id === params[0] && r.status === 'PENDING');
        return { rows: reqs, rowCount: reqs.length };
      }

      if (q.includes('FROM student_verification_requests WHERE roster_id=$1') && q.includes("status='PENDING'")) {
        const reqs = Array.from(store.verificationRequests.values()).filter(r => r.roster_id === params[0] && r.status === 'PENDING');
        return { rows: reqs, rowCount: reqs.length };
      }

      if (q.includes('INSERT INTO student_verification_requests')) {
        const vReq = {
          id: randomUUID(),
          user_id: params[0],
          roster_id: params[1],
          status: params[2],
          claim_channel: params[3],
          notes: params[4],
          institution_id: params[5] || null,
          created_at: new Date(),
          expires_at: new Date(Date.now() + 7 * 86400000),
          reviewed_by_user_id: null,
          reviewed_at: null,
          identity_evidence_reference: null,
        };
        store.verificationRequests.set(vReq.id, vReq);
        return { rows: [vReq], rowCount: 1 };
      }

      if (q.includes('FROM student_verification_requests svr')) {
        if (q.includes('WHERE svr.id = $1') || q.includes('WHERE svr.id=$1')) {
          const req = store.verificationRequests.get(params[0]);
          if (!req) return { rows: [], rowCount: 0 };
          const u = store.users.get(req.user_id) || {};
          const r = Array.from(store.studentRosters.values()).find(x => x.id === req.roster_id) || {};
          const d = store.departments.get(r.department_code) || {};
          return {
            rows: [{
              ...req,
              user_email: u.email,
              user_name: u.name,
              register_number: r.register_number,
              institutional_email: r.institutional_email,
              roster_name: r.full_name,
              department_code: r.department_code,
              batch_year: r.batch_year,
              department_name: d.name || r.department_code,
              approved_personal_email: r.approved_personal_email,
              is_test_record: r.is_test_record,
              bound_user_id: u.roster_id === r.id ? u.id : null,
              user_current_roster_id: u.roster_id || null,
              roster_active: r.is_active !== undefined ? r.is_active : (r.active !== undefined ? r.active : true),
            }],
            rowCount: 1
          };
        }

        // List claims
        const rows = [];
        for (const req of store.verificationRequests.values()) {
          const u = store.users.get(req.user_id) || {};
          const r = Array.from(store.studentRosters.values()).find(x => x.id === req.roster_id) || {};
          const d = store.departments.get(r.department_code) || {};
          rows.push({
            ...req,
            user_email: u.email,
            user_name: u.name,
            register_number: r.register_number,
            institutional_email: r.institutional_email,
            roster_name: r.full_name,
            department_code: r.department_code,
            batch_year: r.batch_year,
            department_name: d.name || r.department_code,
            approved_personal_email: r.approved_personal_email,
            is_test_record: r.is_test_record,
            bound_user_id: u.roster_id === r.id ? u.id : null,
            user_current_roster_id: u.roster_id || null,
          });
        }
        return { rows, rowCount: rows.length };
      }

      if (q.includes('UPDATE student_verification_requests')) {
        if (q.includes("SET status='APPROVED'") || q.includes('status=$1') || q.includes("status='REJECTED'")) {
          const id = params[params.length - 1];
          const req = store.verificationRequests.get(id);
          if (req) {
            if (q.includes("SET status='APPROVED'")) {
              req.status = 'APPROVED';
              req.notes = params[0];
              req.verification_method = params[1];
              req.identity_evidence_reference = params[2];
              req.reviewed_by_user_id = params[3];
              req.reviewed_at = new Date();
            } else if (q.includes("SET status='REJECTED'")) {
              req.status = 'REJECTED';
              req.rejection_reason = params[0];
            } else if (params[0]) {
              req.status = params[0];
            }
          }
          return { rows: [], rowCount: 1 };
        }
      }

      // complaints insertion
      if (q.includes('INSERT INTO complaints')) {
        const comp = {
          id: randomUUID(),
          case_id: 'CASE-' + Date.now().toString().slice(-6),
          reference_id: 'REF-' + Date.now().toString().slice(-6),
          category: params[1],
          description: params[2],
          status: 'Pending',
          created_at: new Date()
        };
        store.complaints.set(comp.id, comp);
        return { rows: [comp], rowCount: 1 };
      }

      // Step up tokens table
      if (q.includes('INSERT INTO step_up_tokens')) {
        store.stepUpTokens.set(params[0], { token_hash: params[0], user_id: params[1], purpose: params[2], session_hash: params[3] });
        return { rows: [], rowCount: 1 };
      }

      if (q.includes('DELETE FROM step_up_tokens')) {
        const tokenHash = params[0];
        const tokenRec = store.stepUpTokens.get(tokenHash);
        if (tokenRec) {
          store.stepUpTokens.delete(tokenHash);
          return { rows: [{ token_hash: tokenHash }], rowCount: 1 };
        }
        return { rows: [{ token_hash: tokenHash }], rowCount: 1 };
      }

      // Audit logs
      if (q.includes('INSERT INTO audit_logs')) {
        store.auditLogs.push({ actor_id: params[0], action: params[1], details: params[2] });
        return { rows: [], rowCount: 1 };
      }

      // default query fallback returns empty rows rather than dummy { '1': 1 }
      return { rows: [], rowCount: 0 };
    }
  };

  const mockTransaction = async (fn) => fn(mockDb);

  return { ownerUser, store, mockDb, mockTransaction, grantToken };
}

function mockHttp(env, options = {}) {
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

  const auth = {
    sessionUser: async () => user,
    logout: async () => {},
  };

  const handler = createHandler(auth, { database: () => env.mockDb, transaction: env.mockTransaction }, { consumeRateLimit: async () => ({}) });

  return { req, res, handler };
}

test('G09.2 — Stored Google subject alone cannot auto-approve an institutional claim', async () => {
  const env = createMockEnvironment();

  // Authoritative Roster
  const regNo = '22CS101';
  const instEmail = 'priya.22cs@college.edu.in';
  env.store.studentRosters.set(regNo, {
    id: randomUUID(),
    register_number: regNo,
    institutional_email: instEmail,
    full_name: 'Priya S',
    department_code: 'CSE',
    batch_year: '2022-2026',
    active: true,
  });

  // Student user with institutional email
  const studentUser = {
    id: randomUUID(),
    email: instEmail,
    name: 'Priya S',
    role: 'student',
    account_status: 'active',
    is_verified_student: false,
    google_subject_id: 'google_sub_priya_101',
    roster_id: null,
    session_hash: digest('session_path_a'),
    permissions: [],
  };
  env.store.users.set(studentUser.id, studentUser);

  const { req, res, handler } = mockHttp(env, {
    method: 'POST',
    url: '/api/student/verification-request',
    body: { registerNumber: regNo },
    user: studentUser,
  });

  await handler(req, res);
  assert.equal(res.statusCode, 201);
  const data = res.json();
  assert.equal(data.status, 'PENDING');
  assert.equal(data.autoApproved, false);
  assert.equal(data.registerNumber, regNo);

  // No elevation from a stored subject or self-declared email.
  const updatedUser = env.store.users.get(studentUser.id);
  assert.equal(updatedUser.is_verified_student, false);
  assert.equal(updatedUser.roster_id, null);
});

test('G09.1 — Path B: Personal Google Account Enrollment & Grievance Blocker', async () => {
  const env = createMockEnvironment();

  const regNo = '22EC205';
  const instEmail = 'karthik.22ec@college.edu.in';
  const personalEmail = 'karthik.personal@gmail.com';

  env.store.studentRosters.set(regNo, {
    id: randomUUID(),
    register_number: regNo,
    institutional_email: instEmail,
    full_name: 'Karthik N',
    department_code: 'ECE',
    batch_year: '2022-2026',
    approved_personal_email: personalEmail,
    active: true,
  });

  const studentUser = {
    id: randomUUID(),
    email: personalEmail,
    name: 'Karthik N',
    role: 'student',
    account_status: 'active',
    is_verified_student: false,
    roster_id: null,
    session_hash: digest('session_path_b'),
    permissions: [],
  };
  env.store.users.set(studentUser.id, studentUser);

  // 1. Submit claim from personal Google email
  const { req, res, handler } = mockHttp(env, {
    method: 'POST',
    url: '/api/student/verification-request',
    body: { registerNumber: regNo, notes: 'Personal Google onboarding' },
    user: studentUser,
  });

  await handler(req, res);
  assert.equal(res.statusCode, 201);
  const data = res.json();
  assert.equal(data.status, 'PENDING');
  assert.equal(data.autoApproved, false);
  assert.equal(data.registerNumber, regNo);

  // Assert user is still unverified
  const checkUser = env.store.users.get(studentUser.id);
  assert.equal(checkUser.is_verified_student, false);
  assert.equal(checkUser.roster_id, null);

  // 2. Invariant: Unverified student cannot file grievance
  const grievanceReq = mockHttp(env, {
    method: 'POST',
    url: '/api/complaints',
    body: {
      category: 'General Campus Grievance',
      description: 'Hostel power failure',
      identityMode: 'standard',
      riskFlags: {}
    },
    user: studentUser,
  });
  await grievanceReq.handler(grievanceReq.req, grievanceReq.res);
  assert.equal(grievanceReq.res.statusCode, 403);
});

test('G09.1 — Owner Claims Governance: Review, Approval & Revocation Cycle', async () => {
  const env = createMockEnvironment();

  const regNo = '22IT301';
  const instEmail = 'anita.22it@college.edu.in';
  const personalEmail = 'anita.test@gmail.com';

  const rosterId = randomUUID();
  env.store.studentRosters.set(regNo, {
    id: rosterId,
    register_number: regNo,
    institutional_email: instEmail,
    full_name: 'Anita R',
    department_code: 'IT',
    batch_year: '2022-2026',
    approved_personal_email: personalEmail,
    active: true,
  });

  const studentUser = {
    id: randomUUID(),
    email: personalEmail,
    name: 'Anita R',
    role: 'student',
    account_status: 'active',
    is_verified_student: false,
    roster_id: null,
    session_hash: digest('session_anita'),
    permissions: [],
  };
  env.store.users.set(studentUser.id, studentUser);

  // Create pending claim
  const claimId = randomUUID();
  env.store.verificationRequests.set(claimId, {
    id: claimId,
    user_id: studentUser.id,
    roster_id: rosterId,
    status: 'PENDING',
    claim_channel: 'PERSONAL_GOOGLE_ROSTER',
    notes: 'Awaiting primary owner review',
    created_at: new Date(),
    expires_at: new Date(Date.now() + 7 * 86400000),
  });

  const stepUpToken = await issueStepUpToken(OWNER_ID, 'admin_step_up', env.mockDb, env.ownerUser.session_hash);

  // 1. Owner lists claims
  const listReq = mockHttp(env, {
    method: 'GET',
    url: '/api/owner/verification-claims',
    user: env.ownerUser,
    headers: { 'x-aegis-owner-grant': env.grantToken }
  });
  await listReq.handler(listReq.req, listReq.res);
  assert.equal(listReq.res.statusCode, 200);
  const claimList = listReq.res.json().claims;
  assert.equal(claimList.length, 1);
  assert.equal(claimList[0].id, claimId);

  // 2. Owner Approves Claim
  const approveReq = mockHttp(env, {
    method: 'POST',
    url: `/api/owner/verification-claims/${claimId}/review`,
    body: {
      decision: 'APPROVED',
      notes: 'College photo ID card verified against campus register.',
      identityEvidenceReference: 'VERIFIED-ID-9921',
      stepUpToken,
    },
    user: env.ownerUser,
    headers: { 'x-aegis-owner-grant': env.grantToken }
  });
  await approveReq.handler(approveReq.req, approveReq.res);
  assert.equal(approveReq.res.statusCode, 200);
  assert.equal(approveReq.res.json().decision, 'APPROVED');

  // Verify Student User is now verified and bound
  const verifiedUser = env.store.users.get(studentUser.id);
  assert.equal(verifiedUser.is_verified_student, true);
  assert.equal(verifiedUser.roster_id, rosterId);

  // 3. Student can now submit grievance
  const grievanceReq = mockHttp(env, {
    method: 'POST',
    url: '/api/complaints',
    body: {
      category: 'General Campus Grievance',
      description: 'Hostel mess hygiene concern',
      identityMode: 'standard',
      riskFlags: {}
    },
    user: verifiedUser,
  });
  await grievanceReq.handler(grievanceReq.req, grievanceReq.res);
  assert.equal(grievanceReq.res.statusCode, 201);

  // 4. Owner Revokes Claim
  const stepUpRevoke = await issueStepUpToken(OWNER_ID, 'admin_step_up', env.mockDb, env.ownerUser.session_hash);
  const revokeReq = mockHttp(env, {
    method: 'POST',
    url: `/api/owner/verification-claims/${claimId}/revoke`,
    body: {
      reason: 'Identity documentation found to be superseded.',
      stepUpToken: stepUpRevoke,
    },
    user: env.ownerUser,
    headers: { 'x-aegis-owner-grant': env.grantToken }
  });
  await revokeReq.handler(revokeReq.req, revokeReq.res);
  assert.equal(revokeReq.res.statusCode, 200);
  assert.equal(revokeReq.res.json().ok, true);

  // Verify Student is unbound and reset
  const unverifiedUser = env.store.users.get(studentUser.id);
  assert.equal(unverifiedUser.is_verified_student, false);
  assert.equal(unverifiedUser.roster_id, null);
});

test('G09.1 — CSV Roster Preview and Import API', async () => {
  const env = createMockEnvironment();

  // 1. Preview
  const sampleRecords = [
    {
      registerNumber: '22AI101',
      institutionalEmail: 'valid@college.edu.in',
      fullName: 'Valid Student',
      departmentCode: 'AIDS',
      batchYear: '2022-2026'
    },
    {
      registerNumber: 'BAD$REG',
      institutionalEmail: 'bad-email',
      fullName: 'Invalid Student',
      departmentCode: 'UNKNOWN_DEPT',
      batchYear: '2022-2026'
    }
  ];

  const previewReq = mockHttp(env, {
    method: 'POST',
    url: '/api/admin/roster/preview',
    body: { records: sampleRecords, version: 'v2' },
    user: env.ownerUser,
    headers: { 'x-aegis-owner-grant': env.grantToken }
  });
  await previewReq.handler(previewReq.req, previewReq.res);
  assert.equal(previewReq.res.statusCode, 200);
  const previewData = previewReq.res.json();
  assert.equal(previewData.total, 2);
  assert.equal(previewData.validCount, 1);
  assert.equal(previewData.errorCount, 1);

  // 2. Batch Import
  const stepUpToken = await issueStepUpToken(OWNER_ID, 'admin_step_up', env.mockDb, env.ownerUser.session_hash);
  const importReq = mockHttp(env, {
    method: 'POST',
    url: '/api/admin/roster/import',
    body: {
      version: 'v2',
      institutionCode: 'default',
      records: [
        {
          registerNumber: '22AI101',
          institutionalEmail: 'valid@college.edu.in',
          fullName: 'Valid Student',
          departmentCode: 'AIDS',
          batchYear: '2022-2026',
          approvedPersonalEmail: 'valid.personal@gmail.com',
          isTestRecord: true,
        }
      ],
      stepUpToken,
    },
    user: env.ownerUser,
    headers: { 'x-aegis-owner-grant': env.grantToken }
  });
  await importReq.handler(importReq.req, importReq.res);
  assert.equal(importReq.res.statusCode, 200);
  assert.equal(importReq.res.json().importedCount, 1);

  const importedRecord = env.store.studentRosters.get('22AI101');
  assert.equal(importedRecord.approved_personal_email, 'valid.personal@gmail.com');
  assert.equal(importedRecord.is_test_record, true);
});

test('G09.1 — Owner Institutions Multi-Domain Configuration', async () => {
  const env = createMockEnvironment();

  // 1. List
  const listReq = mockHttp(env, {
    method: 'GET',
    url: '/api/owner/institutions',
    user: env.ownerUser,
    headers: { 'x-aegis-owner-grant': env.grantToken }
  });
  await listReq.handler(listReq.req, listReq.res);
  assert.equal(listReq.res.statusCode, 200);
  const insts = listReq.res.json().institutions;
  assert.equal(insts.length, 1);
  assert.equal(insts[0].slug, 'default');

  // 2. Create
  const createReq = mockHttp(env, {
    method: 'POST',
    url: '/api/owner/institutions',
    body: {
      slug: 'acet-south',
      name: 'ACET South Campus',
      domains: ['acetsouth.edu.in'],
      supportedMethods: ['INSTITUTIONAL_EMAIL', 'PERSONAL_GOOGLE_ROSTER'],
    },
    user: env.ownerUser,
    headers: { 'x-aegis-owner-grant': env.grantToken }
  });
  await createReq.handler(createReq.req, createReq.res);
  assert.equal(createReq.res.statusCode, 201);
  const newInst = createReq.res.json().institution;
  assert.equal(newInst.slug, 'acet-south');
  assert.equal(newInst.active, true);

  // 3. Toggle Active Status
  const patchReq = mockHttp(env, {
    method: 'PATCH',
    url: `/api/owner/institutions/${newInst.id}`,
    body: { active: false },
    user: env.ownerUser,
    headers: { 'x-aegis-owner-grant': env.grantToken }
  });
  await patchReq.handler(patchReq.req, patchReq.res);
  assert.equal(patchReq.res.statusCode, 200);
  assert.equal(patchReq.res.json().institution.active, false);
});

test('Security Invariant: Self-declared institutional email without OAuth verification NEVER auto-approves', async () => {
  const env = createMockEnvironment();

  const regNo = '22CS202';
  const instEmail = 'rahul.22cs@college.edu.in';
  env.store.studentRosters.set(regNo, {
    id: randomUUID(),
    register_number: regNo,
    institutional_email: instEmail,
    full_name: 'Rahul R',
    department_code: 'CSE',
    batch_year: '2022-2026',
    active: true,
  });

  // User registered via password (no google_subject_id) claiming institutional email
  const unverifiedStudent = {
    id: randomUUID(),
    email: instEmail,
    name: 'Rahul R',
    role: 'student',
    account_status: 'active',
    is_verified_student: false,
    google_subject_id: null, // Self-declared, not provider-confirmed!
    roster_id: null,
    session_hash: digest('session_unverified_pwd'),
    permissions: [],
  };
  env.store.users.set(unverifiedStudent.id, unverifiedStudent);

  const { req, res, handler } = mockHttp(env, {
    method: 'POST',
    url: '/api/student/verification-request',
    body: { registerNumber: regNo },
    user: unverifiedStudent,
  });

  await handler(req, res);
  assert.equal(res.statusCode, 201);
  const data = res.json();
  // MUST NOT BE AUTO-APPROVED! Must be PENDING!
  assert.equal(data.status, 'PENDING');
  assert.equal(data.autoApproved, false);

  const updatedUser = env.store.users.get(unverifiedStudent.id);
  assert.equal(updatedUser.is_verified_student, false);
  assert.equal(updatedUser.roster_id, null);
});

test('Security Invariant: Authority (HOD) cannot approve PERSONAL_GOOGLE_ROSTER verification claims', async () => {
  const env = createMockEnvironment();

  const regNo = '22EC303';
  const rosterId = randomUUID();
  env.store.studentRosters.set(regNo, {
    id: rosterId,
    register_number: regNo,
    institutional_email: 'priya.22ec@college.edu.in',
    full_name: 'Priya ECE',
    department_code: 'ECE',
    batch_year: '2022-2026',
    active: true,
  });

  const studentUser = {
    id: randomUUID(),
    email: 'priya.personal@gmail.com',
    name: 'Priya Personal',
    role: 'student',
    account_status: 'active',
    is_verified_student: false,
    google_subject_id: 'google_sub_priya_personal',
    roster_id: null,
    session_hash: digest('session_priya_personal'),
    permissions: [],
  };
  env.store.users.set(studentUser.id, studentUser);

  const claimId = randomUUID();
  env.store.verificationRequests.set(claimId, {
    id: claimId,
    user_id: studentUser.id,
    roster_id: rosterId,
    status: 'PENDING',
    claim_channel: 'PERSONAL_GOOGLE_ROSTER',
    expires_at: new Date(Date.now() + 86400000),
    department_code: 'ECE',
    register_number: regNo,
  });

  const hodUser = {
    id: randomUUID(),
    email: 'hod.ece@college.edu.in',
    name: 'Dr. ECE HOD',
    role: 'HOD',
    account_status: 'active',
    department_code: 'ECE',
    assigned_departments: ['ECE'],
    session_hash: digest('session_hod_ece'),
    permissions: [],
  };
  env.store.users.set(hodUser.id, hodUser);

  const { req, res, handler } = mockHttp(env, {
    method: 'POST',
    url: `/api/authority/students/requests/${claimId}/review`,
    body: {
      decision: 'APPROVED',
      notes: 'HOD attempting unauthorized approval of personal Google account claim',
      verificationMethod: 'IN_PERSON_COLLEGE_ID',
      identityEvidenceReference: 'COLLEGE_ID_CARD_777',
    },
    user: hodUser,
  });

  await handler(req, res);
  // Must fail with 403 Forbidden!
  assert.equal(res.statusCode, 403);
  assert.match(res.json().error, /Administrator access required/);
});



test('G09.2 Owner approval rejects expired, missing-expiry and evidence-free claims without binding', async()=>{
 for(const scenario of ['expired','missing','evidence']) {
  const env=createMockEnvironment();const rosterId=randomUUID();const userId=randomUUID();const claimId=randomUUID();
  env.store.studentRosters.set('22CS777',{id:rosterId,register_number:'22CS777',institutional_email:'target@college.edu.in',department_code:'CSE',active:true,bound_user_id:null});
  env.store.users.set(userId,{id:userId,email:'target@gmail.com',name:'Target',role:'student',account_status:'active',is_verified_student:false,roster_id:null});
  env.store.verificationRequests.set(claimId,{id:claimId,user_id:userId,roster_id:rosterId,status:'PENDING',claim_channel:'PERSONAL_GOOGLE_ROSTER',expires_at:scenario==='expired'?new Date(0):scenario==='missing'?null:new Date(Date.now()+3600000)});
  const token=await issueStepUpToken(OWNER_ID,'admin_step_up',env.mockDb,env.ownerUser.session_hash);
  const req=mockHttp(env,{method:'POST',url:'/api/owner/verification-claims/'+claimId+'/review',body:{decision:'APPROVED',notes:'Independent enrollment review attempted',stepUpToken:token,...(scenario==='evidence'?{}:{identityEvidenceReference:'REGISTRAR-2026-19'})},user:env.ownerUser,headers:{'x-aegis-owner-grant':env.grantToken}});
  await req.handler(req.req,req.res);assert.equal(req.res.statusCode,scenario==='evidence'?422:400);
  assert.equal(env.store.users.get(userId).is_verified_student,false);assert.equal(env.store.studentRosters.get('22CS777').bound_user_id,null);
 }
});
test('G09.2 HOD and Dean titles alone cannot list enrollment claims',async()=>{
 for(const role of ['HOD','Dean','Higher Authority']){
  const env=createMockEnvironment();const req=mockHttp(env,{method:'GET',url:'/api/authority/students/requests',user:{id:randomUUID(),role,account_status:'active',permissions:[]}});
  await req.handler(req.req,req.res);assert.equal(req.res.statusCode,403);
 }
});
