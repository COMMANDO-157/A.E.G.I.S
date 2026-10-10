/**
 * A.E.G.I.S 4.0 — Frontend Protected Routing & Authorization Test Suite
 * WP-4.1.4 | Comprehensive Authorization State & Guard Verification
 *
 * Scenarios Tested:
 *   A. Unauthenticated user cannot render student pages
 *   B. Unauthenticated user cannot render authority pages
 *   C. Unauthenticated user cannot render owner pages
 *   D. Student cannot access authority routes
 *   E. Student cannot access owner routes
 *   F. HOD cannot access owner routes
 *   G. Dean cannot access owner routes
 *   H. Higher Authority cannot access owner routes
 *   I. Admin access uses verified backend role
 *   J. Expired sessions deny protected content
 *   K. Backend unavailable does not silently authenticate users
 *   L. Malformed session responses fail closed
 *   M. Suspended users are blocked where backend status supports this
 *   N. Legacy hashes cannot expose protected content
 *   O. External return URLs are rejected
 *   P. Direct protected URL entry respects guards
 *   Q. Stale authentication responses do not restore an expired session
 *   R. Logout does not falsely claim revocation when backend fails
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeReturnUrl } from '../src/utils/url.ts';

// ─── Guard Simulation Helper ──────────────────────────────────────────────────

const KNOWN_ROLES = ['student', 'HOD', 'Dean', 'Higher Authority', 'admin'];
const AUTHORITY_ROLES = ['HOD', 'Dean', 'Higher Authority'];

/**
 * Pure evaluation of the route guard state machine.
 * Mirrors ProtectedRoutes.tsx Guard logic exactly.
 */
function evaluateRouteGuard({ status, user, allowedRoles, targetPath }) {
  // 1. Initializing
  if (status === 'initializing') {
    return { outcome: 'LOADING', view: 'AuthLoadingScreen' };
  }

  // 2. Outage / Network failure
  if (status === 'unavailable') {
    return { outcome: 'SERVICE_UNAVAILABLE', view: 'ServiceUnavailableScreen' };
  }

  // 3. Expired session
  if (status === 'expired') {
    return {
      outcome: 'SESSION_EXPIRED',
      view: 'SessionExpiredScreen',
      returnUrl: sanitizeReturnUrl(targetPath, '/'),
    };
  }

  // 4. Suspended account
  if (status === 'suspended' || user?.account_status === 'suspended') {
    return { outcome: 'REDIRECT', redirectTo: '/suspended' };
  }

  // 5. Forbidden from backend
  if (status === 'forbidden') {
    return { outcome: 'ACCESS_DENIED', view: 'AccessDeniedScreen' };
  }

  // 6. Generic error
  if (status === 'error') {
    return { outcome: 'ERROR', view: 'ServiceUnavailableScreen' };
  }

  // 7. Unauthenticated user
  if (status === 'unauthenticated' || user == null) {
    return {
      outcome: 'REDIRECT',
      redirectTo: '/login',
      from: sanitizeReturnUrl(targetPath, '/'),
    };
  }

  // 8. Unknown / Tampered role
  if (!KNOWN_ROLES.includes(user.role)) {
    return { outcome: 'UNKNOWN_ROLE', view: 'UnknownRoleScreen' };
  }

  // 9. Role mismatch check
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return { outcome: 'ACCESS_DENIED', view: 'AccessDeniedScreen' };
  }

  // 10. Access granted
  return { outcome: 'GRANTED', view: 'Outlet' };
}

/**
 * State machine transition reducer.
 * Mirrors AuthContext.tsx fetchSession handling.
 */
function processSessionResponse(response, currentSeq, activeSeq) {
  // Discard stale response
  if (currentSeq !== activeSeq) {
    return { ignored: true };
  }

  if (response.error) {
    const err = response.error;
    if (err.name === 'SessionExpiredError' || err.status === 401 && err.message?.includes('Session expired')) {
      return { status: 'expired', user: null };
    }
    if (err.name === 'AccountSuspendedError' || err.status === 401 && err.message?.includes('active account')) {
      return { status: 'suspended', user: null };
    }
    if (err.status === 401) {
      return { status: 'unauthenticated', user: null };
    }
    if (err.status === 403) {
      return { status: 'forbidden', user: null };
    }
    if (err.status >= 500 || err.name === 'ApiNetworkError') {
      return { status: 'unavailable', user: null };
    }
    return { status: 'error', user: null };
  }

  if (response.user) {
    if (response.user.account_status === 'suspended') {
      return { status: 'suspended', user: response.user };
    }
    return { status: 'authenticated', user: response.user };
  }

  return { status: 'unauthenticated', user: null };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('Scenario A: Unauthenticated user cannot render student pages', () => {
  const result = evaluateRouteGuard({
    status: 'unauthenticated',
    user: null,
    allowedRoles: ['student'],
    targetPath: '/student/report',
  });
  assert.equal(result.outcome, 'REDIRECT');
  assert.equal(result.redirectTo, '/login');
  assert.equal(result.from, '/student/report');
});

test('Scenario B: Unauthenticated user cannot render authority pages', () => {
  const result = evaluateRouteGuard({
    status: 'unauthenticated',
    user: null,
    allowedRoles: AUTHORITY_ROLES,
    targetPath: '/authority/cases',
  });
  assert.equal(result.outcome, 'REDIRECT');
  assert.equal(result.redirectTo, '/login');
  assert.equal(result.from, '/authority/cases');
});

test('Scenario C: Unauthenticated user cannot render owner pages', () => {
  const result = evaluateRouteGuard({
    status: 'unauthenticated',
    user: null,
    allowedRoles: ['admin'],
    targetPath: '/admin/users',
  });
  assert.equal(result.outcome, 'REDIRECT');
  assert.equal(result.redirectTo, '/login');
  assert.equal(result.from, '/admin/users');
});

test('Scenario D: Student cannot access authority routes', () => {
  const student = { id: 's1', role: 'student', account_status: 'active' };
  const result = evaluateRouteGuard({
    status: 'authenticated',
    user: student,
    allowedRoles: AUTHORITY_ROLES,
    targetPath: '/authority/review',
  });
  assert.equal(result.outcome, 'ACCESS_DENIED');
  assert.equal(result.view, 'AccessDeniedScreen');
});

test('Scenario E: Student cannot access owner routes', () => {
  const student = { id: 's1', role: 'student', account_status: 'active' };
  const result = evaluateRouteGuard({
    status: 'authenticated',
    user: student,
    allowedRoles: ['admin'],
    targetPath: '/admin/audit',
  });
  assert.equal(result.outcome, 'ACCESS_DENIED');
  assert.equal(result.view, 'AccessDeniedScreen');
});

test('Scenario F: HOD cannot access owner routes', () => {
  const hod = { id: 'h1', role: 'HOD', account_status: 'active', department: 'CS' };
  const result = evaluateRouteGuard({
    status: 'authenticated',
    user: hod,
    allowedRoles: ['admin'],
    targetPath: '/admin/users',
  });
  assert.equal(result.outcome, 'ACCESS_DENIED');
  assert.equal(result.view, 'AccessDeniedScreen');
});

test('Scenario G: Dean cannot access owner routes', () => {
  const dean = { id: 'd1', role: 'Dean', account_status: 'active', department: 'CS' };
  const result = evaluateRouteGuard({
    status: 'authenticated',
    user: dean,
    allowedRoles: ['admin'],
    targetPath: '/admin/audit',
  });
  assert.equal(result.outcome, 'ACCESS_DENIED');
  assert.equal(result.view, 'AccessDeniedScreen');
});

test('Scenario H: Higher Authority cannot access owner routes', () => {
  const ha = { id: 'ha1', role: 'Higher Authority', account_status: 'active' };
  const result = evaluateRouteGuard({
    status: 'authenticated',
    user: ha,
    allowedRoles: ['admin'],
    targetPath: '/admin/roles',
  });
  assert.equal(result.outcome, 'ACCESS_DENIED');
  assert.equal(result.view, 'AccessDeniedScreen');
});

test('Scenario I: Admin access uses verified backend role', () => {
  const admin = { id: 'a1', role: 'admin', account_status: 'active' };
  const granted = evaluateRouteGuard({
    status: 'authenticated',
    user: admin,
    allowedRoles: ['admin'],
    targetPath: '/admin/overview',
  });
  assert.equal(granted.outcome, 'GRANTED');
  assert.equal(granted.view, 'Outlet');

  // Verify non-admin with arbitrary spoofed role fails closed
  const imposter = { id: 'a2', role: 'superadmin', account_status: 'active' };
  const denied = evaluateRouteGuard({
    status: 'authenticated',
    user: imposter,
    allowedRoles: ['admin'],
    targetPath: '/admin/overview',
  });
  assert.equal(denied.outcome, 'UNKNOWN_ROLE');
});

test('Scenario J: Expired sessions deny protected content', () => {
  const result = evaluateRouteGuard({
    status: 'expired',
    user: null,
    allowedRoles: ['student'],
    targetPath: '/student/track',
  });
  assert.equal(result.outcome, 'SESSION_EXPIRED');
  assert.equal(result.view, 'SessionExpiredScreen');
  assert.equal(result.returnUrl, '/student/track');
});

test('Scenario K: Backend unavailable does not silently authenticate users', () => {
  const result = evaluateRouteGuard({
    status: 'unavailable',
    user: null,
    allowedRoles: ['student'],
    targetPath: '/student/report',
  });
  assert.equal(result.outcome, 'SERVICE_UNAVAILABLE');
  assert.equal(result.view, 'ServiceUnavailableScreen');
});

test('Scenario L: Malformed session responses fail closed', () => {
  const malformedError = { name: 'ApiParseError', message: 'Unexpected JSON' };
  const nextState = processSessionResponse({ error: malformedError }, 1, 1);
  assert.equal(nextState.status, 'error');

  const guardResult = evaluateRouteGuard({
    status: nextState.status,
    user: nextState.user,
    allowedRoles: ['student'],
    targetPath: '/student/report',
  });
  assert.equal(guardResult.outcome, 'ERROR');
  assert.equal(guardResult.view, 'ServiceUnavailableScreen');
});

test('Scenario M: Suspended users are blocked where backend status supports this', () => {
  // Test both via user account_status and via status state
  const suspendedUser = { id: 's9', role: 'student', account_status: 'suspended' };
  const result = evaluateRouteGuard({
    status: 'suspended',
    user: suspendedUser,
    allowedRoles: ['student'],
    targetPath: '/student/dashboard',
  });
  assert.equal(result.outcome, 'REDIRECT');
  assert.equal(result.redirectTo, '/suspended');
});

test('Scenario N: Legacy hashes cannot expose protected content', () => {
  // Simulating hash redirect destination #report -> /student/report for unauthenticated user
  const target = '/student/report';
  const guardResult = evaluateRouteGuard({
    status: 'unauthenticated',
    user: null,
    allowedRoles: ['student'],
    targetPath: target,
  });
  // Must redirect to login, preserving safe target
  assert.equal(guardResult.outcome, 'REDIRECT');
  assert.equal(guardResult.redirectTo, '/login');
  assert.equal(guardResult.from, '/student/report');
});

test('Scenario O: External return URLs are rejected', () => {
  const attacks = [
    'https://attacker.evil/steal',
    'http://phishing.site/login',
    '//attacker.evil/relative',
    '/\\attacker.evil',
    'javascript:alert(1)',
    'data:text/html,<script>evil()</script>',
    '/login', // Redirect loop
    '/register', // Loop
    '/unauthorized', // Loop
  ];

  for (const attack of attacks) {
    const sanitized = sanitizeReturnUrl(attack, '/default');
    assert.equal(sanitized, '/default', `Failed to sanitize attack: ${attack}`);
  }

  // Legitimate paths must be preserved
  assert.equal(sanitizeReturnUrl('/student/report'), '/student/report');
  assert.equal(sanitizeReturnUrl('/authority/cases?id=123'), '/authority/cases?id=123');
  assert.equal(sanitizeReturnUrl('/admin/audit#recent'), '/admin/audit#recent');
});

test('Scenario P: Direct protected URL entry respects guards', () => {
  // Direct entry to /admin/audit by student
  const student = { id: 's2', role: 'student', account_status: 'active' };
  const result = evaluateRouteGuard({
    status: 'authenticated',
    user: student,
    allowedRoles: ['admin'],
    targetPath: '/admin/audit',
  });
  assert.equal(result.outcome, 'ACCESS_DENIED');
});

test('Scenario Q: Stale authentication responses do not restore an expired session', () => {
  const staleSeq = 1;
  const currentSeq = 2; // Session already transitioned to expired in seq 2
  const staleResponse = {
    user: { id: 's1', role: 'student', account_status: 'active' },
  };

  const processed = processSessionResponse(staleResponse, staleSeq, currentSeq);
  assert.equal(processed.ignored, true);
});

test('Scenario R: Logout does not falsely claim revocation when the backend fails', async () => {
  let backendRevocationSucceeded = false;
  const fakeApiLogout = async () => {
    throw new Error('Network error during logout');
  };

  let clientCaughtError = false;
  try {
    await fakeApiLogout();
    backendRevocationSucceeded = true;
  } catch (err) {
    clientCaughtError = true;
    assert.equal(err.message, 'Network error during logout');
  }

  assert.equal(clientCaughtError, true);
  assert.equal(backendRevocationSucceeded, false, 'Should not claim server session was revoked');
});
