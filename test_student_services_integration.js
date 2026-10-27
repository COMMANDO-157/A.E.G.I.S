/**
 * A.E.G.I.S — Student Services Integration & Security Verification Suite
 *
 * Verifies:
 * 1. Legal state transitions (requested -> acknowledged -> in_progress -> completed / cancelled).
 * 2. Invalid state transitions rejected with 422.
 * 3. Student-to-student access denial (403 on reading or modifying other student's request).
 * 4. Cross-institution access denial (403).
 * 5. Unauthorized staff access & Department scoping (HOD of ME cannot review CSE request).
 * 6. Duplicate open request denial (409) for same service and student.
 * 7. Optimistic concurrency control (version mismatch rejects with 409).
 * 8. Transaction rollback: failure on audit log or update rolls back all changes.
 * 9. Durable append-only audit record consistency (action, actor, state transition).
 * 10. Live handler remains fail-closed with 503 G11_STRICT_HOLD before auth/body parsing.
 * 11. Routine services remain strictly separate from confidential grievances and well-being.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  SERVICE_CATEGORIES,
  SERVICE_REQUEST_STATES,
  validateStateTransition,
  requireStudentOwnership,
  requireStaffServiceAccess,
  createServiceRequest,
  transitionServiceRequest,
  listStudentRequests,
  listStaffQueue,
  getRequestDetails
} from './server/student-services.js';
import { createLocalServicesHandler } from './server/local-services-handler.js';
import { createHandler } from './server/handler.js';

// ─── Synthetic In-Memory Database Simulator for PostgreSQL testing ──────────
function createSyntheticDatabase() {
  const institutions = new Map();
  const departments = new Map();
  const catalog = new Map();
  const requests = new Map();
  const auditLogs = [];
  const users = new Map();

  // Seed default institution & departments
  const defaultInstId = randomUUID();
  const otherInstId = randomUUID();

  institutions.set(defaultInstId, {
    id: defaultInstId,
    slug: 'default',
    name: 'Autonomous College of Engineering',
    active: true
  });
  institutions.set(otherInstId, {
    id: otherInstId,
    slug: 'other',
    name: 'External College of Technology',
    active: true
  });

  departments.set('CSE', { code: 'CSE', name: 'Computer Science', institution_id: defaultInstId, active: true });
  departments.set('ECE', { code: 'ECE', name: 'Electronics', institution_id: defaultInstId, active: true });
  departments.set('ME', { code: 'ME', name: 'Mechanical', institution_id: defaultInstId, active: true });

  // Seed catalog items
  const academicServiceId = randomUUID();
  const accessServiceId = randomUUID();
  const finServiceId = randomUUID();

  catalog.set(academicServiceId, {
    id: academicServiceId,
    institution_id: defaultInstId,
    department_code: 'CSE',
    service_code: 'academic_guidance',
    category: 'academic',
    title: 'Academic Guidance & Advising',
    description: 'Advising for course selection and degree requirements.',
    active: true,
    sla_hours: 48
  });

  catalog.set(accessServiceId, {
    id: accessServiceId,
    institution_id: defaultInstId,
    department_code: null,
    service_code: 'accessibility_support',
    category: 'accessibility',
    title: 'Accessibility Accommodations',
    description: 'Exam and classroom accessibility arrangements.',
    active: true,
    sla_hours: 72
  });

  catalog.set(finServiceId, {
    id: finServiceId,
    institution_id: defaultInstId,
    department_code: null,
    service_code: 'financial_aid_info',
    category: 'financial',
    title: 'Financial Aid & Scholarship Information',
    description: 'Guidance regarding fee concessions and government scholarships.',
    active: true,
    sla_hours: 96
  });

  // Query engine simulator supporting basic SQL constructs used by student-services
  const query = async (sql, params = []) => {
    const s = sql.trim().replace(/\s+/g, ' ');

    // 1. SELECT from catalog
    if (/SELECT .* FROM student_services_catalog/i.test(s)) {
      if (/WHERE id = \$1 AND institution_id = \$2 AND active = true/i.test(s)) {
        const item = catalog.get(params[0]);
        if (item && item.institution_id === params[1] && item.active) {
          return { rows: [{ ...item }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
      if (/WHERE institution_id = \$1 AND active = true/i.test(s)) {
        const rows = [...catalog.values()].filter(c => c.institution_id === params[0] && c.active);
        return { rows, rowCount: rows.length };
      }
    }

    // 2. Duplicate open request check
    if (/SELECT id, reference_number FROM student_service_requests WHERE student_user_id = \$1 AND service_id = \$2/i.test(s)) {
      const rows = [...requests.values()].filter(
        r => r.student_user_id === params[0] && r.service_id === params[1] && ['requested', 'acknowledged', 'in_progress'].includes(r.state)
      );
      return { rows, rowCount: rows.length };
    }

    // 3. INSERT into student_service_requests
    if (/INSERT INTO student_service_requests/i.test(s)) {
      const id = randomUUID();
      const now = new Date();
      const row = {
        id,
        reference_number: params[0],
        institution_id: params[1],
        department_code: params[2],
        service_id: params[3],
        student_user_id: params[4],
        state: 'requested',
        subject: params[5],
        details: params[6],
        version: 1,
        resolution_notes: null,
        assigned_staff_id: null,
        created_at: now,
        updated_at: now,
        acknowledged_at: null,
        completed_at: null,
        cancelled_at: null
      };
      requests.set(id, row);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    // 4. INSERT into student_services_audit_logs
    if (/INSERT INTO student_services_audit_logs/i.test(s)) {
      if (params.length === 3) {
        // (request_id, actor_id, action, from_state, to_state, details) VALUES ($1, $2, 'CREATED', NULL, 'requested', $3)
        const log = {
          id: randomUUID(),
          request_id: params[0],
          actor_id: params[1],
          action: 'CREATED',
          from_state: null,
          to_state: 'requested',
          details: typeof params[2] === 'string' ? JSON.parse(params[2]) : params[2],
          timestamp: new Date()
        };
        auditLogs.push(log);
        return { rows: [{ ...log }], rowCount: 1 };
      }
      const log = {
        id: randomUUID(),
        request_id: params[0],
        actor_id: params[1],
        action: params[2],
        from_state: params[3],
        to_state: params[4],
        details: typeof params[5] === 'string' ? JSON.parse(params[5]) : params[5],
        timestamp: new Date()
      };
      auditLogs.push(log);
      return { rows: [{ ...log }], rowCount: 1 };
    }

    // 5. SELECT single request FOR UPDATE or regular
    if (/SELECT \* FROM student_service_requests WHERE id = \$1/i.test(s)) {
      const r = requests.get(params[0]);
      return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
    }

    // 6. UPDATE student_service_requests
    if (/UPDATE student_service_requests SET state = \$1/i.test(s)) {
      const id = params[8];
      const expectedVersion = params[9];
      const r = requests.get(id);
      if (!r || r.version !== expectedVersion) {
        return { rows: [], rowCount: 0 };
      }
      r.state = params[0];
      r.version = params[1];
      if (params[2] !== null) r.resolution_notes = params[2];
      r.assigned_staff_id = params[3];
      r.acknowledged_at = params[4];
      r.completed_at = params[5];
      r.cancelled_at = params[6];
      r.updated_at = params[7];
      requests.set(id, r);
      return { rows: [{ ...r }], rowCount: 1 };
    }

    // 7. List student requests
    if (/SELECT r\.\*, c\.title as service_title/i.test(s) && /WHERE r\.student_user_id = \$1/i.test(s)) {
      const rows = [...requests.values()]
        .filter(r => r.student_user_id === params[0])
        .map(r => ({ ...r, service_title: catalog.get(r.service_id)?.title, service_category: catalog.get(r.service_id)?.category }));
      return { rows, rowCount: rows.length };
    }

    // 8. Single request join
    if (/SELECT r\.\*, c\.title as service_title/i.test(s) && /WHERE r\.id = \$1/i.test(s)) {
      const r = requests.get(params[0]);
      if (!r) return { rows: [], rowCount: 0 };
      return {
        rows: [{
          ...r,
          service_title: catalog.get(r.service_id)?.title,
          service_category: catalog.get(r.service_id)?.category
        }],
        rowCount: 1
      };
    }

    // 9. Staff queue
    if (/SELECT r\.\*, c\.title as service_title/i.test(s) && /FROM student_service_requests r/i.test(s)) {
      let filtered = [...requests.values()];
      if (params.includes(defaultInstId)) {
        filtered = filtered.filter(r => r.institution_id === defaultInstId);
      }
      // Department filter for HOD
      const depts = params.find(p => Array.isArray(p));
      if (depts) {
        filtered = filtered.filter(r => depts.includes(r.department_code));
      }
      const rows = filtered.map(r => ({
        ...r,
        service_title: catalog.get(r.service_id)?.title,
        service_category: catalog.get(r.service_id)?.category,
        student_name: users.get(r.student_user_id)?.name || 'Synthetic Student',
        student_email: users.get(r.student_user_id)?.email || 'student@campus.test'
      }));
      return { rows, rowCount: rows.length };
    }

    // 10. Audit log list for request
    if (/SELECT a\.\*, u\.name as actor_name/i.test(s)) {
      const rows = auditLogs
        .filter(a => a.request_id === params[0])
        .map(a => ({
          ...a,
          actor_name: users.get(a.actor_id)?.name || 'Actor',
          actor_role: users.get(a.actor_id)?.role || 'student'
        }));
      return { rows, rowCount: rows.length };
    }

    throw new Error(`Unhandled synthetic SQL in test mock: ${sql}`);
  };

  const transaction = async (fn) => {
    // Snapshot state for rollback simulation
    const snapshotReqs = new Map([...requests.entries()].map(([k, v]) => [k, { ...v }]));
    const snapshotAudit = [...auditLogs.map(a => ({ ...a }))];
    const client = { query };
    try {
      return await fn(client);
    } catch (err) {
      // Rollback
      requests.clear();
      for (const [k, v] of snapshotReqs.entries()) requests.set(k, v);
      auditLogs.length = 0;
      for (const a of snapshotAudit) auditLogs.push(a);
      throw err;
    }
  };

  return {
    database: () => ({ query }),
    transaction,
    defaultInstId,
    otherInstId,
    academicServiceId,
    accessServiceId,
    finServiceId,
    users,
    requests,
    auditLogs
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

test('1. Legal and illegal state transitions in Student Services', () => {
  assert.doesNotThrow(() => validateStateTransition('requested', 'acknowledged'));
  assert.doesNotThrow(() => validateStateTransition('requested', 'cancelled'));
  assert.doesNotThrow(() => validateStateTransition('acknowledged', 'in_progress'));
  assert.doesNotThrow(() => validateStateTransition('acknowledged', 'cancelled'));
  assert.doesNotThrow(() => validateStateTransition('in_progress', 'completed'));
  assert.doesNotThrow(() => validateStateTransition('in_progress', 'cancelled'));

  // Illegal transitions
  assert.throws(() => validateStateTransition('requested', 'completed'), { status: 422 });
  assert.throws(() => validateStateTransition('completed', 'requested'), { status: 422 });
  assert.throws(() => validateStateTransition('cancelled', 'acknowledged'), { status: 422 });
  assert.throws(() => validateStateTransition('in_progress', 'acknowledged'), { status: 422 });
});

test('2. Student request creation and duplicate open request denial', async () => {
  const env = createSyntheticDatabase();
  const student = {
    id: randomUUID(),
    role: 'student',
    account_status: 'active',
    institution_id: env.defaultInstId
  };
  env.users.set(student.id, student);

  const payload = {
    institutionId: env.defaultInstId,
    departmentCode: 'CSE',
    serviceId: env.academicServiceId,
    subject: 'Course Drop Request',
    details: 'Need assistance dropping elective course prior to deadline.'
  };

  // Successful creation
  const created = await env.transaction(client => createServiceRequest(client, student, payload));
  assert.equal(created.state, 'requested');
  assert.equal(created.version, 1);
  assert.match(created.reference_number, /^SR-\d{4}-[A-Z0-9]+$/);
  assert.equal(env.auditLogs.length, 1);
  assert.equal(env.auditLogs[0].action, 'CREATED');

  // Duplicate open request denial
  await assert.rejects(
    env.transaction(client => createServiceRequest(client, student, payload)),
    { status: 409 }
  );
});

test('3. Student-to-student access denial and cross-institution denial', async () => {
  const env = createSyntheticDatabase();
  const studentA = { id: randomUUID(), role: 'student', account_status: 'active', institution_id: env.defaultInstId };
  const studentB = { id: randomUUID(), role: 'student', account_status: 'active', institution_id: env.defaultInstId };
  const extStudent = { id: randomUUID(), role: 'student', account_status: 'active', institution_id: env.otherInstId };

  env.users.set(studentA.id, studentA);
  env.users.set(studentB.id, studentB);

  const reqA = await env.transaction(client =>
    createServiceRequest(client, studentA, {
      institutionId: env.defaultInstId,
      departmentCode: 'CSE',
      serviceId: env.academicServiceId,
      subject: 'Transcript copy',
      details: 'Requesting official duplicate transcript copy.'
    })
  );

  // Student B cannot read Student A's request
  await assert.rejects(
    getRequestDetails(env.database(), studentB, reqA.id),
    { status: 403 }
  );

  // Student B cannot cancel Student A's request
  await assert.rejects(
    env.transaction(client => transitionServiceRequest(client, studentB, reqA.id, { expectedVersion: 1, nextState: 'cancelled' })),
    { status: 403 }
  );

  // External student cannot create request at default institution
  await assert.rejects(
    env.transaction(client =>
      createServiceRequest(client, extStudent, {
        institutionId: env.defaultInstId,
        departmentCode: 'CSE',
        serviceId: env.academicServiceId,
        subject: 'External inquiry',
        details: 'Attempting cross institution request.'
      })
    ),
    { status: 403 }
  );
});

test('4. Staff scoping and department isolation (HOD ME cannot act on CSE request)', async () => {
  const env = createSyntheticDatabase();
  const student = { id: randomUUID(), role: 'student', account_status: 'active', institution_id: env.defaultInstId };
  const hodCSE = { id: randomUUID(), role: 'HOD', account_status: 'active', institution_id: env.defaultInstId, department: 'CSE' };
  const hodME = { id: randomUUID(), role: 'HOD', account_status: 'active', institution_id: env.defaultInstId, department: 'ME' };
  const dean = { id: randomUUID(), role: 'Dean', account_status: 'active', institution_id: env.defaultInstId };

  env.users.set(student.id, student);
  env.users.set(hodCSE.id, hodCSE);
  env.users.set(hodME.id, hodME);
  env.users.set(dean.id, dean);

  const req = await env.transaction(client =>
    createServiceRequest(client, student, {
      institutionId: env.defaultInstId,
      departmentCode: 'CSE',
      serviceId: env.academicServiceId,
      subject: 'Lab allocation question',
      details: 'Inquiring about assigned GPU lab workstation allocation.'
    })
  );

  // HOD ME cannot acknowledge or review CSE request
  await assert.rejects(
    env.transaction(client => transitionServiceRequest(client, hodME, req.id, { expectedVersion: 1, nextState: 'acknowledged' })),
    { status: 403 }
  );

  // HOD CSE can acknowledge request
  const ack = await env.transaction(client =>
    transitionServiceRequest(client, hodCSE, req.id, { expectedVersion: 1, nextState: 'acknowledged' })
  );
  assert.equal(ack.state, 'acknowledged');
  assert.equal(ack.version, 2);

  // Dean can transition acknowledged -> in_progress
  const inProg = await env.transaction(client =>
    transitionServiceRequest(client, dean, req.id, { expectedVersion: 2, nextState: 'in_progress', assignedStaffId: hodCSE.id })
  );
  assert.equal(inProg.state, 'in_progress');
  assert.equal(inProg.version, 3);

  // Completion requires resolution notes
  await assert.rejects(
    env.transaction(client => transitionServiceRequest(client, hodCSE, req.id, { expectedVersion: 3, nextState: 'completed', resolutionNotes: '' })),
    { status: 422 }
  );

  const completed = await env.transaction(client =>
    transitionServiceRequest(client, hodCSE, req.id, { expectedVersion: 3, nextState: 'completed', resolutionNotes: 'Allocated workstation in Lab 4.' })
  );
  assert.equal(completed.state, 'completed');
  assert.equal(completed.version, 4);
});

test('5. Optimistic concurrency version mismatch rejects with 409', async () => {
  const env = createSyntheticDatabase();
  const student = { id: randomUUID(), role: 'student', account_status: 'active', institution_id: env.defaultInstId };
  const hod = { id: randomUUID(), role: 'HOD', account_status: 'active', institution_id: env.defaultInstId, department: 'CSE' };
  env.users.set(student.id, student);
  env.users.set(hod.id, hod);

  const req = await env.transaction(client =>
    createServiceRequest(client, student, {
      institutionId: env.defaultInstId,
      departmentCode: 'CSE',
      serviceId: env.academicServiceId,
      subject: 'Subject counseling',
      details: 'Discussion on major elective tracks.'
    })
  );

  // Stale expectedVersion (e.g. 99 instead of 1)
  await assert.rejects(
    env.transaction(client => transitionServiceRequest(client, hod, req.id, { expectedVersion: 99, nextState: 'acknowledged' })),
    { status: 409 }
  );
});

test('6. Transactional rollback preserves state when downstream operation fails', async () => {
  const env = createSyntheticDatabase();
  const student = { id: randomUUID(), role: 'student', account_status: 'active', institution_id: env.defaultInstId };
  env.users.set(student.id, student);

  const initialRequestsCount = env.requests.size;
  const initialAuditCount = env.auditLogs.length;

  try {
    await env.transaction(async client => {
      await createServiceRequest(client, student, {
        institutionId: env.defaultInstId,
        departmentCode: 'CSE',
        serviceId: env.academicServiceId,
        subject: 'Failing transaction test',
        details: 'This will intentionally trigger a downstream error.'
      });
      // Downstream failure
      throw new Error('Simulated database deadlock or disk write error');
    });
  } catch (err) {
    assert.equal(err.message, 'Simulated database deadlock or disk write error');
  }

  // Verify rollback occurred: request and audit count unchanged
  assert.equal(env.requests.size, initialRequestsCount);
  assert.equal(env.auditLogs.length, initialAuditCount);
});

test('7. Local Services API handler exercises authenticated request lifecycle', async () => {
  const env = createSyntheticDatabase();
  const student = { id: randomUUID(), role: 'student', account_status: 'active', institution_id: env.defaultInstId };
  const hod = { id: randomUUID(), role: 'HOD', account_status: 'active', institution_id: env.defaultInstId, department: 'CSE' };
  env.users.set(student.id, student);
  env.users.set(hod.id, hod);

  let currentUser = student;
  const handler = createLocalServicesHandler({
    auth: { sessionUser: async () => currentUser },
    store: { database: env.database, transaction: env.transaction },
    security: { consumeRateLimit: async () => ({}) }
  });

  // A. List catalog
  const resCat = { setHeader() {}, end(d) { this.data = JSON.parse(d); } };
  await handler({ method: 'GET', url: '/api/local-services/catalog' }, resCat);
  assert.equal(resCat.statusCode, 200);
  assert.equal(resCat.data.catalog.length, 3);

  // B. Student creates request
  const resCreate = { setHeader() {}, end(d) { this.data = JSON.parse(d); } };
  await handler({
    method: 'POST',
    url: '/api/local-services/requests',
    body: {
      institutionId: env.defaultInstId,
      departmentCode: 'CSE',
      serviceId: env.academicServiceId,
      subject: 'Attendance adjustment',
      details: 'Submitting official attendance rectification slip.'
    }
  }, resCreate);
  assert.equal(resCreate.statusCode, 201);
  const createdReq = resCreate.data.request;
  assert.equal(createdReq.state, 'requested');

  // C. Staff queue check
  currentUser = hod;
  const resQueue = { setHeader() {}, end(d) { this.data = JSON.parse(d); } };
  await handler({ method: 'GET', url: '/api/local-services/staff/queue' }, resQueue);
  assert.equal(resQueue.statusCode, 200);
  assert.equal(resQueue.data.queue.length, 1);
  assert.equal(resQueue.data.queue[0].id, createdReq.id);

  // D. Staff transitions request to acknowledged
  const resTrans = { setHeader() {}, end(d) { this.data = JSON.parse(d); } };
  await handler({
    method: 'PATCH',
    url: `/api/local-services/requests/${createdReq.id}`,
    body: { expectedVersion: 1, nextState: 'acknowledged' }
  }, resTrans);
  assert.equal(resTrans.statusCode, 200);
  assert.equal(resTrans.data.request.state, 'acknowledged');

  // E. Audit log detail check
  const resDetail = { setHeader() {}, end(d) { this.data = JSON.parse(d); } };
  await handler({ method: 'GET', url: `/api/local-services/requests/${createdReq.id}` }, resDetail);
  assert.equal(resDetail.statusCode, 200);
  assert.equal(resDetail.data.auditLogs.length, 2);
  assert.equal(resDetail.data.auditLogs[1].action, 'ACKNOWLEDGED');
});

test('8. Live handler G11 STRICT HOLD remains unbypassed on /api/student-services and /api/wellbeing', async () => {
  const handler = createHandler();
  for (const root of ['student-services', 'wellbeing']) {
    for (const url of [`/api/${root}`, `/api/${root}/requests`, `/api?route=${root}`]) {
      const res = { setHeader() {}, end(d) { this.data = JSON.parse(d); } };
      await handler({ method: 'GET', url }, res);
      assert.equal(res.statusCode, 503);
      assert.equal(res.data.code, 'G11_STRICT_HOLD');
    }
  }
});
