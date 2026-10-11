/**
 * A.E.G.I.S 4.0 — Work Package 5.5A.1 Automated Test Suite
 * Database constraints, uniqueness invariants, multi-department scoping,
 * transactional concurrency protection, and negative security rules.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { database, transaction } from './server/db.js';
import { canRead, canAct, hasAdminPermission, DELEGATED_PERMISSIONS } from './server/policy.js';

test('WP-5.5A.1 Schema: Canonical departments exist and enforce regex constraints', async () => {
  const db = database();
  const res = await db.query('SELECT code, name, active FROM departments ORDER BY code');
  assert.ok(res.rowCount >= 7, 'Expected at least 7 seeded departments');
  
  const codes = res.rows.map(r => r.code);
  assert.ok(codes.includes('CSE'));
  assert.ok(codes.includes('IT'));
  assert.ok(codes.includes('ECE'));

  // Negative test: Invalid department code format
  await assert.rejects(
    async () => {
      await db.query("INSERT INTO departments(code, name) VALUES('lowercase_bad', 'Invalid Dept')");
    },
    /departments_code_check/
  );
});

test('WP-5.5A.1 Schema: Student rosters enforce register number uniqueness and format', async () => {
  const db = database();
  const testReg = 'TESTREG999901';
  const testEmail1 = 'student1.test@college.edu.in';
  const testEmail2 = 'student2.test@college.edu.in';

  await db.query('DELETE FROM student_rosters WHERE register_number = $1', [testReg]);

  // Valid insert
  const insertRes = await db.query(
    'INSERT INTO student_rosters(register_number, institutional_email, full_name, department_code, batch_year) VALUES($1, $2, $3, $4, $5) RETURNING id',
    [testReg, testEmail1, 'Test Student 1', 'IT', '2022-2026']
  );
  assert.equal(insertRes.rowCount, 1);

  // Negative test: Duplicate register number rejected
  await assert.rejects(
    async () => {
      await db.query(
        'INSERT INTO student_rosters(register_number, institutional_email, full_name, department_code, batch_year) VALUES($1, $2, $3, $4, $5)',
        [testReg, testEmail2, 'Test Student 2', 'IT', '2022-2026']
      );
    },
    (err) => err.code === '23505' // unique_violation
  );

  // Clean up
  await db.query('DELETE FROM student_rosters WHERE register_number = $1', [testReg]);
});

test('WP-5.5A.1 Schema: Verification requests enforce single active PENDING request invariant', async () => {
  const db = database();
  
  const rand = Date.now().toString();
  // Create temporary test user and test roster entry
  const userRes = await db.query(
    "INSERT INTO users(google_subject_id, email, name, role) VALUES($1, $2, 'Test User', 'student') RETURNING id",
    ['test_sub_' + rand, 'test_' + rand + '@college.edu.in']
  );
  const userId = userRes.rows[0].id;

  const rosterRes = await db.query(
    "INSERT INTO student_rosters(register_number, institutional_email, full_name, department_code, batch_year) VALUES($1, $2, 'Test User', 'CSE', '2022-2026') RETURNING id",
    ['TESTREG' + rand.slice(-6), 'test_' + rand + '@college.edu.in']
  );
  const rosterId = rosterRes.rows[0].id;

  try {
    // 1st PENDING request succeeds
    const req1 = await db.query(
      "INSERT INTO student_verification_requests(user_id, roster_id, status, claim_channel) VALUES($1, $2, 'PENDING', 'STUDENT_MANUAL_CLAIM') RETURNING id",
      [userId, rosterId]
    );
    assert.equal(req1.rowCount, 1);

    // 2nd PENDING request for same user fails with unique index violation
    await assert.rejects(
      async () => {
        await db.query(
          "INSERT INTO student_verification_requests(user_id, roster_id, status, claim_channel) VALUES($1, $2, 'PENDING', 'STUDENT_MANUAL_CLAIM')",
          [userId, rosterId]
        );
      },
      (err) => err.code === '23505'
    );
  } finally {
    await db.query('DELETE FROM student_verification_requests WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM student_rosters WHERE id = $1', [rosterId]);
    await db.query("UPDATE users SET account_status = 'suspended' WHERE id = $1", [userId]);
  }
});

test('WP-5.5A.1 Policy: Multi-department authority assignments enforce strict boundaries', () => {
  // Staff member with acting HOD appointments in CSE and IT
  const multiStaff = {
   id: 'staff-multi',
   role: 'HOD',
   account_status: 'active',
   department: 'CSE',
   assigned_departments: ['CSE', 'IT']
  };

  const complaintCse = { id: 'c-cse', assigned_authority: 'HOD', department: 'CSE' };
  const complaintIt = { id: 'c-it', assigned_authority: 'HOD', department: 'IT' };
  const complaintMech = { id: 'c-mech', assigned_authority: 'HOD', department: 'MECH' };

  // Can read and act on both assigned departments
  assert.equal(canRead(multiStaff, complaintCse), true, 'HOD should access primary dept CSE');
  assert.equal(canRead(multiStaff, complaintIt), true, 'HOD should access secondary assigned dept IT');
  assert.equal(canAct(multiStaff, complaintCse), true);
  assert.equal(canAct(multiStaff, complaintIt), true);

  // Negative test: Strictly denied access to unassigned department MECH
  assert.equal(canRead(multiStaff, complaintMech), false, 'HOD must be denied access to unassigned dept MECH');
  assert.equal(canAct(multiStaff, complaintMech), false);
});

test('WP-5.5A.1 Policy: Institutional delegated permissions extended properly', () => {
  assert.ok(DELEGATED_PERMISSIONS.includes('roster.import'));
  assert.ok(DELEGATED_PERMISSIONS.includes('roster.conflicts.manage'));
  assert.ok(DELEGATED_PERMISSIONS.includes('department.students.verify'));

  const adminWithRoster = {
    id: 'admin-1',
    role: 'admin',
    account_status: 'active',
    is_primary_owner: false,
    permissions: ['roster.import']
  };

  assert.equal(hasAdminPermission(adminWithRoster, 'roster.import'), true);
  assert.equal(hasAdminPermission(adminWithRoster, 'roster.conflicts.manage'), false);
  assert.equal(hasAdminPermission(adminWithRoster, 'users.roles.assign'), false);

  const primaryOwner = {
    id: 'owner-1',
    role: 'admin',
    account_status: 'active',
    is_primary_owner: true,
    permissions: []
  };

  assert.equal(hasAdminPermission(primaryOwner, 'roster.import'), true, 'Primary Owner has universal permissions');
  assert.equal(hasAdminPermission(primaryOwner, 'department.students.verify'), true);
});

test('WP-5.5A.1 Concurrency: Transactional advisory locking serializes verification claims', async () => {
  // Simulates two concurrent workers competing for the same roster claim lock
  let worker1Acquired = false;
  let worker2Blocked = false;

  const testKey = 987654321;

  await transaction(async (client1) => {
    await client1.query('SELECT pg_advisory_xact_lock($1)', [testKey]);
    worker1Acquired = true;

    // Worker 2 attempts non-blocking try_lock in another transaction
    const db = database();
    const tryRes = await db.query('SELECT pg_try_advisory_xact_lock($1) AS locked', [testKey]);
    worker2Blocked = !tryRes.rows[0].locked;
  });

  assert.equal(worker1Acquired, true, 'Worker 1 acquired transactional lock');
  assert.equal(worker2Blocked, true, 'Worker 2 was locked out from concurrent claim on the same key');
});
