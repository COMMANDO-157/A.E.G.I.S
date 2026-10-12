import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { validatePasswordStrength, hashPassword, verifyPassword } from './server/crypto.js';
import { issuePasswordResetToken, verifyAndConsumePasswordResetToken, digest } from './server/auth.js';
import { createHandler } from './server/handler.js';

test('Dual Auth: Password strength validation enforce strict institutional complexity', () => {
  // Too short (< 10 chars)
  assert.throws(() => validatePasswordStrength('Short1!'), { status: 422 });
  // Missing uppercase
  assert.throws(() => validatePasswordStrength('lowercase123!@#'), { status: 422 });
  // Missing lowercase
  assert.throws(() => validatePasswordStrength('UPPERCASE123!@#'), { status: 422 });
  // Missing number
  assert.throws(() => validatePasswordStrength('NoNumbersHere!@#'), { status: 422 });
  // Missing special symbol
  assert.throws(() => validatePasswordStrength('NoSpecialSymbol123'), { status: 422 });
  // Valid strong password passes without throwing
  assert.doesNotThrow(() => validatePasswordStrength('Aegis#Secure2026!Pass'));
});

test('Dual Auth: Salted scrypt hashing and constant-time verification', () => {
  const password = 'CorrectHorseBatteryStaple!2026';
  const { passwordHash, passwordSalt } = hashPassword(password);
  
  assert.ok(passwordHash && passwordHash.length === 128, 'Hash must be 128-char hex string (64 bytes derived)');
  assert.ok(passwordSalt && passwordSalt.length === 64, 'Salt must be 64-char hex string (32 bytes)');

  // Verify correct password matches
  assert.equal(verifyPassword(password, passwordHash, passwordSalt), true);

  // Verify incorrect password fails
  assert.equal(verifyPassword('WrongPassword!2026', passwordHash, passwordSalt), false);

  // Verify altered salt fails
  const alteredSalt = '0'.repeat(64);
  assert.equal(verifyPassword(password, passwordHash, alteredSalt), false);
});

test('Dual Auth: Password reset tokens issue, expire, and single-use consume', async () => {
  const userId = 'usr-test-1234';
  let storedTokens = [];
  
  const mockDb = {
    query: async (sql, values) => {
      if (sql.includes('UPDATE password_reset_tokens SET used=true WHERE user_id=$1')) {
        return { rowCount: 0 };
      }
      if (sql.includes('INSERT INTO password_reset_tokens')) {
        const [token_hash, uid] = values;
        storedTokens.push({ id: 'tok-1', user_id: uid, token_hash, used: false, expires_at: new Date(Date.now() + 3600000) });
        return { rowCount: 1 };
      }
      if (sql.includes('UPDATE password_reset_tokens SET used=true, used_at=now()')) {
        const [token_hash] = values;
        const item = storedTokens.find(t => t.token_hash === token_hash && !t.used && t.expires_at > new Date());
        if (item) {
          item.used = true;
          return { rowCount: 1, rows: [{ user_id: item.user_id }] };
        }
        return { rowCount: 0, rows: [] };
      }
      return { rows: [] };
    }
  };

  const rawToken = await issuePasswordResetToken(userId, mockDb);
  assert.ok(rawToken && rawToken.length >= 32, 'Raw token must be generated');

  // Verify valid consumption
  const consumedUserId = await verifyAndConsumePasswordResetToken(rawToken, mockDb);
  assert.equal(consumedUserId, userId, 'Token should be verified and consumed');

  // Second consumption must fail (single-use)
  const secondConsume = await verifyAndConsumePasswordResetToken(rawToken, mockDb);
  assert.equal(secondConsume, null, 'Consumed token must not be reusable');
});

test('Dual Auth: Account Lockout after 5 failed password attempts', async () => {
  let failedAttempts = 4;
  let lockedUntil = null;
  const storedUser = {
    id: 'usr-student-lockout',
    email: 'student@college.edu.in',
    role: 'student',
    account_status: 'active',
    password_hash: '0'.repeat(128),
    password_salt: '1'.repeat(64),
    password_failed_attempts: failedAttempts,
    password_locked_until: lockedUntil
  };

  const mockDb = {
    query: async (sql, values) => {
      if (sql.includes('FROM users') && sql.includes('lower(email)=$1')) {
        return { rows: [storedUser] };
      }
      if (sql.includes('UPDATE users SET password_failed_attempts')) {
        storedUser.password_failed_attempts = values[0];
        storedUser.password_locked_until = values[1];
        return { rowCount: 1 };
      }
      if (sql.includes('INSERT INTO audit_logs')) {
        return { rowCount: 1 };
      }
      return { rows: [] };
    }
  };

  const server = http.createServer(
    createHandler(
      { sessionUser: async () => storedUser, logout: async () => {} },
      { database: () => mockDb, transaction: fn => fn(mockDb) },
      { consumeRateLimit: async () => ({ remaining: 100 }) }
    )
  );

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = origin;

  try {
    // Attempt 5 with wrong password -> triggers lockout
    const res = await fetch(origin + '/api/auth/login-password', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student@college.edu.in', password: 'WrongPassword!123' })
    });
    
    assert.equal(res.status, 429);
    const body = await res.json();
    assert.match(body.error, /Account locked for 15 minutes/);
    assert.equal(storedUser.password_failed_attempts, 5);
    assert.ok(storedUser.password_locked_until !== null);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});

test('Dual Auth: Public registration auto-rejects privileged role escalation and invalid email domains', async () => {
  const mockDb = {
    query: async () => ({ rows: [] })
  };

  const server = http.createServer(
    createHandler(
      { sessionUser: async () => null, logout: async () => {} },
      { database: () => mockDb, transaction: fn => fn(mockDb) },
      { consumeRateLimit: async () => ({ remaining: 100 }) }
    )
  );

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = origin;

  try {
    // 1. Attempt registering with privileged role (e.g., admin / owner)
    // fieldsOnly rejects 'role' field with 422
    const privRes = await fetch(origin + '/api/auth/register', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'attacker@college.edu.in',
        name: 'Attacker Account',
        department: 'CS',
        password: 'ValidPassword123!',
        role: 'admin'
      })
    });
    assert.equal(privRes.status, 422, 'Public registration rejects disallowed role field with 422');

    // 2. Attempt registering with non-institutional email domain
    const nonInstRes = await fetch(origin + '/api/auth/register', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'attacker@gmail.com',
        name: 'Attacker Account',
        department: 'CS',
        password: 'ValidPassword123!'
      })
    });
    assert.equal(nonInstRes.status, 403, 'Public registration must reject non-institutional domain with 403');
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});

test('Multi-Portal & Roles: Dedicated route isolation and server policy enforcement', async () => {
  // Test server policy for all roles:
  // Primary Owner, Delegated Admin, HOD, Dean, Higher Authority, Student
  const { canRead, canAct, requireAdmin } = await import('./server/policy.js');

  const studentUser = { id: 's1', role: 'student', account_status: 'active', department: 'CS' };
  const hodUser = { id: 'h1', role: 'HOD', account_status: 'active', department: 'CS' };
  const deanUser = { id: 'd1', role: 'Dean', account_status: 'active', department: null };
  const authorityUser = { id: 'a1', role: 'Higher Authority', account_status: 'active', department: null };
  const delegatedAdminUser = { id: 'adm1', role: 'admin', account_status: 'active', permissions: ['manage_rosters'] };
  const primaryOwnerUser = { id: 'own1', role: 'admin', account_status: 'active', is_primary_owner: true, permissions: [] };

  const csCase = { id: 'case-1', owner_user_id: 's1', department: 'CS', assigned_authority: 'HOD', verification_status: 'Submitted' };
  const meCase = { id: 'case-2', owner_user_id: 's2', department: 'ME', assigned_authority: 'HOD', verification_status: 'Submitted' };
  const escalatedDeanCase = { id: 'case-3', owner_user_id: 's1', department: 'CS', assigned_authority: 'Dean', verification_status: 'Escalated to Dean' };
  const escalatedAuthCase = { id: 'case-4', owner_user_id: 's1', department: 'CS', assigned_authority: 'Higher Authority', verification_status: 'Escalated to Authority' };

  // 1. Student portal isolation
  assert.equal(canRead(studentUser, csCase), true, 'Student can read own complaint');
  assert.equal(canRead(studentUser, meCase), false, 'Student cannot read other student complaint');
  assert.throws(() => requireAdmin(studentUser), { status: 403 }, 'Student cannot access admin routes');

  // 2. HOD portal isolation (department-scoped)
  assert.equal(canRead(hodUser, csCase), true, 'HOD can read cases in own department');
  assert.equal(canRead(hodUser, meCase), false, 'HOD cannot read cases from another department');
  assert.equal(canRead(hodUser, escalatedDeanCase), false, 'HOD cannot act once escalated to Dean');

  // 3. Dean portal (reviews Dean-escalated cases across departments)
  assert.equal(canRead(deanUser, escalatedDeanCase), true, 'Dean can read cases escalated to Dean');
  assert.equal(canAct(deanUser, escalatedDeanCase), true, 'Dean can act on cases escalated to Dean');
  assert.equal(canRead(deanUser, csCase), false, 'Dean cannot act on non-escalated HOD cases');

  // 4. Higher Authority portal (reviews Higher Authority escalated cases)
  assert.equal(canRead(authorityUser, escalatedAuthCase), true, 'Authority can read escalated case');
  assert.equal(canAct(authorityUser, escalatedAuthCase), true, 'Authority can act on escalated case');
  assert.equal(canRead(authorityUser, csCase), true, 'Higher Authority can review lower tier cases');

  // 5. Admin & Primary Owner clearance
  assert.doesNotThrow(() => requireAdmin(delegatedAdminUser), 'Delegated admin passes requireAdmin');
  assert.doesNotThrow(() => requireAdmin(primaryOwnerUser), 'Primary owner passes requireAdmin');
});
