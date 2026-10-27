/**
 * A.E.G.I.S — Student Services Domain Module
 *
 * Dedicated domain supporting:
 * - Routine student services lifecycle (creation, tracking, acknowledgment, assignment, progress, completion, cancellation)
 * - Strict legal state transitions and concurrency checks
 * - Strict separation from confidential grievances and protected well-being
 * - Department and institution scoping
 * - Append-only durable audit records
 */

import { randomUUID } from 'node:crypto';
import { fail, fieldsOnly, active } from './policy.js';

export const SERVICE_CATEGORIES = ['academic', 'accessibility', 'financial', 'administrative', 'facilities'];
export const SERVICE_REQUEST_STATES = ['requested', 'acknowledged', 'in_progress', 'completed', 'cancelled'];

export const LEGAL_TRANSITIONS = {
  requested: ['acknowledged', 'cancelled'],
  acknowledged: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: []
};

/**
 * Validates that nextState is reachable from currentState.
 */
export function validateStateTransition(currentState, nextState) {
  if (!SERVICE_REQUEST_STATES.includes(nextState)) {
    fail(422, `Invalid target state: ${nextState}`);
  }
  const allowed = LEGAL_TRANSITIONS[currentState] || [];
  if (!allowed.includes(nextState)) {
    fail(422, `Illegal state transition from '${currentState}' to '${nextState}'.`);
  }
}

/**
 * Validates student ownership for student-initiated operations.
 */
export function requireStudentOwnership(user, request) {
  active(user);
  if (user.role !== 'student') {
    fail(403, 'Student access required.');
  }
  if (request.student_user_id !== user.id) {
    fail(403, 'Access denied: student can only view and manage their own service requests.');
  }
}

/**
 * Validates staff authorization and department/institution scope.
 */
export function requireStaffServiceAccess(user, request = null) {
  active(user);
  const allowedRoles = ['HOD', 'Dean', 'Higher Authority', 'admin'];
  if (!allowedRoles.includes(user.role)) {
    fail(403, 'Staff authorization required.');
  }

  // If a specific request is passed, enforce scoping
  if (request) {
    // Cross-institution protection
    if (user.institution_id && request.institution_id && user.institution_id !== request.institution_id) {
      fail(403, 'Access denied: cross-institution request access is prohibited.');
    }

    // Department scope for HOD
    if (user.role === 'HOD') {
      const staffDepts = Array.isArray(user.assigned_departments) && user.assigned_departments.length > 0
        ? user.assigned_departments
        : (user.department ? [user.department] : (user.department_code ? [user.department_code] : []));

      if (!staffDepts.includes(request.department_code)) {
        fail(403, `Access denied: HOD is not assigned to department '${request.department_code}'.`);
      }
    }
  }
}

/**
 * Generate standard student service reference number
 */
export function generateReferenceNumber() {
  const year = new Date().getFullYear();
  const rand = randomUUID().replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
  return `SR-${year}-${rand}`;
}

/**
 * Service Catalogue listing (accessible to verified students and staff of that institution)
 */
export async function listCatalog(db, user, institutionId) {
  active(user);
  if (!institutionId) fail(422, 'Institution ID required.');
  
  if (user.institution_id && user.institution_id !== institutionId) {
    fail(403, 'Cross-institution catalogue access denied.');
  }

  const res = await db.query(
    `SELECT id, institution_id, department_code, service_code, category, title, description, active, sla_hours 
     FROM student_services_catalog 
     WHERE institution_id = $1 AND active = true 
     ORDER BY category, title`,
    [institutionId]
  );
  return res.rows;
}

/**
 * Student creates a routine service request.
 * Enforces:
 * - Active verified student status
 * - Matching institution and valid department
 * - Duplicate open request prevention
 * - Atomic audit log entry
 */
export async function createServiceRequest(client, user, payload) {
  active(user);
  if (user.role !== 'student') {
    fail(403, 'Only students can create service requests.');
  }

  fieldsOnly(payload, ['institutionId', 'departmentCode', 'serviceId', 'subject', 'details']);

  const { institutionId, departmentCode, serviceId, subject, details } = payload;

  if (typeof institutionId !== 'string' || !institutionId.trim()) fail(422, 'Institution ID is required.');
  if (typeof departmentCode !== 'string' || !departmentCode.trim()) fail(422, 'Department code is required.');
  if (typeof serviceId !== 'string' || !serviceId.trim()) fail(422, 'Service ID is required.');
  if (typeof subject !== 'string' || subject.trim().length < 3 || subject.length > 200) {
    fail(422, 'Subject must be between 3 and 200 characters.');
  }
  if (typeof details !== 'string' || details.trim().length < 10 || details.length > 5000) {
    fail(422, 'Details must be between 10 and 5000 characters.');
  }

  // Cross-institution check
  if (user.institution_id && user.institution_id !== institutionId) {
    fail(403, 'Cannot create request for another institution.');
  }

  // Verify service exists in catalog and is active
  const catRes = await client.query(
    'SELECT * FROM student_services_catalog WHERE id = $1 AND institution_id = $2 AND active = true',
    [serviceId, institutionId]
  );
  if (catRes.rowCount === 0) {
    fail(422, 'Selected service is not currently available in this institution.');
  }

  // Prevent duplicate open requests for the same service by the student
  const dupRes = await client.query(
    `SELECT id, reference_number FROM student_service_requests 
     WHERE student_user_id = $1 AND service_id = $2 AND state IN ('requested', 'acknowledged', 'in_progress')`,
    [user.id, serviceId]
  );
  if (dupRes.rowCount > 0) {
    fail(409, `You already have an open service request (${dupRes.rows[0].reference_number}) for this service.`);
  }

  const refNumber = generateReferenceNumber();

  const insertRes = await client.query(
    `INSERT INTO student_service_requests 
      (reference_number, institution_id, department_code, service_id, student_user_id, state, subject, details, version)
     VALUES ($1, $2, $3, $4, $5, 'requested', $6, $7, 1)
     RETURNING *`,
    [refNumber, institutionId, departmentCode.trim(), serviceId, user.id, subject.trim(), details.trim()]
  );

  const request = insertRes.rows[0];

  // Append-only audit record
  await client.query(
    `INSERT INTO student_services_audit_logs 
      (request_id, actor_id, action, from_state, to_state, details)
     VALUES ($1, $2, 'CREATED', NULL, 'requested', $3)`,
    [request.id, user.id, JSON.stringify({ referenceNumber: refNumber, serviceId, departmentCode })]
  );

  return request;
}

/**
 * Transition request state (by staff or student cancellation).
 * Enforces:
 * - State transition validity
 * - Optimistic concurrency control (expectedVersion)
 * - Row locking for concurrent safety
 * - Atomic audit log entry
 */
export async function transitionServiceRequest(client, user, requestId, input) {
  active(user);
  fieldsOnly(input, ['expectedVersion', 'nextState', 'resolutionNotes', 'assignedStaffId']);

  const { expectedVersion, nextState, resolutionNotes, assignedStaffId } = input;
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    fail(422, 'Valid expectedVersion is required for concurrency control.');
  }
  if (!SERVICE_REQUEST_STATES.includes(nextState)) {
    fail(422, 'Invalid nextState.');
  }

  // Lock row FOR UPDATE to guard against concurrent mutations
  const selRes = await client.query(
    'SELECT * FROM student_service_requests WHERE id = $1 FOR UPDATE',
    [requestId]
  );
  if (selRes.rowCount === 0) {
    fail(404, 'Service request not found.');
  }

  const current = selRes.rows[0];

  // Concurrency check
  if (current.version !== expectedVersion) {
    fail(409, `Conflict: Request has been modified by another action. Expected version ${expectedVersion}, found ${current.version}.`);
  }

  // Validate state transition legality
  validateStateTransition(current.state, nextState);

  // Authorization checks based on operation
  if (nextState === 'cancelled') {
    // Both student owner and authorized staff can cancel
    if (user.role === 'student') {
      requireStudentOwnership(user, current);
    } else {
      requireStaffServiceAccess(user, current);
    }
  } else {
    // Staff-only transitions (acknowledged, in_progress, completed)
    requireStaffServiceAccess(user, current);
  }

  // If completed, resolution notes are required
  if (nextState === 'completed') {
    if (typeof resolutionNotes !== 'string' || resolutionNotes.trim().length < 5) {
      fail(422, 'Resolution notes (minimum 5 characters) are required when completing a request.');
    }
  }

  const nextVersion = current.version + 1;
  const now = new Date();

  let acknowledgedAt = current.acknowledged_at;
  let completedAt = current.completed_at;
  let cancelledAt = current.cancelled_at;
  let staffId = assignedStaffId !== undefined ? assignedStaffId : current.assigned_staff_id;

  if (nextState === 'acknowledged' && !acknowledgedAt) acknowledgedAt = now;
  if (nextState === 'completed') completedAt = now;
  if (nextState === 'cancelled') cancelledAt = now;

  const updateRes = await client.query(
    `UPDATE student_service_requests
     SET state = $1,
         version = $2,
         resolution_notes = COALESCE($3, resolution_notes),
         assigned_staff_id = $4,
         acknowledged_at = $5,
         completed_at = $6,
         cancelled_at = $7,
         updated_at = $8
     WHERE id = $9 AND version = $10
     RETURNING *`,
    [
      nextState,
      nextVersion,
      resolutionNotes ? resolutionNotes.trim() : null,
      staffId,
      acknowledgedAt,
      completedAt,
      cancelledAt,
      now,
      current.id,
      expectedVersion
    ]
  );

  if (updateRes.rowCount === 0) {
    fail(409, 'Concurrent update conflict occurred.');
  }

  const updated = updateRes.rows[0];

  // Append-only audit log
  await client.query(
    `INSERT INTO student_services_audit_logs 
      (request_id, actor_id, action, from_state, to_state, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      updated.id,
      user.id,
      nextState.toUpperCase(),
      current.state,
      nextState,
      JSON.stringify({
        resolutionNotes: resolutionNotes || null,
        assignedStaffId: staffId,
        actorRole: user.role
      })
    ]
  );

  return updated;
}

/**
 * List requests for student (only own requests)
 */
export async function listStudentRequests(db, user) {
  active(user);
  if (user.role !== 'student') fail(403, 'Student access required.');

  const res = await db.query(
    `SELECT r.*, c.title as service_title, c.category as service_category
     FROM student_service_requests r
     JOIN student_services_catalog c ON c.id = r.service_id
     WHERE r.student_user_id = $1
     ORDER BY r.created_at DESC`,
    [user.id]
  );
  return res.rows;
}

/**
 * List requests for staff queue (scoped by institution and department)
 */
export async function listStaffQueue(db, user, filters = {}) {
  requireStaffServiceAccess(user);

  let query = `
    SELECT r.*, c.title as service_title, c.category as service_category,
           u.name as student_name, u.email as student_email
    FROM student_service_requests r
    JOIN student_services_catalog c ON c.id = r.service_id
    JOIN users u ON u.id = r.student_user_id
    WHERE 1=1
  `;
  const params = [];

  // Scoping
  if (user.institution_id) {
    params.push(user.institution_id);
    query += ` AND r.institution_id = $${params.length}`;
  }

  if (user.role === 'HOD') {
    const depts = Array.isArray(user.assigned_departments) && user.assigned_departments.length > 0
      ? user.assigned_departments
      : (user.department ? [user.department] : (user.department_code ? [user.department_code] : []));

    params.push(depts);
    query += ` AND r.department_code = ANY($${params.length})`;
  }

  if (filters.state) {
    params.push(filters.state);
    query += ` AND r.state = $${params.length}`;
  }

  if (filters.departmentCode) {
    params.push(filters.departmentCode);
    query += ` AND r.department_code = $${params.length}`;
  }

  query += ` ORDER BY r.created_at DESC`;

  const res = await db.query(query, params);
  return res.rows;
}

/**
 * Get single request details along with its dedicated audit history
 */
export async function getRequestDetails(db, user, requestId) {
  active(user);
  const res = await db.query(
    `SELECT r.*, c.title as service_title, c.category as service_category
     FROM student_service_requests r
     JOIN student_services_catalog c ON c.id = r.service_id
     WHERE r.id = $1`,
    [requestId]
  );
  if (res.rowCount === 0) fail(404, 'Service request not found.');

  const request = res.rows[0];

  if (user.role === 'student') {
    requireStudentOwnership(user, request);
  } else {
    requireStaffServiceAccess(user, request);
  }

  // Fetch audit logs
  const auditRes = await db.query(
    `SELECT a.*, u.name as actor_name, u.role as actor_role
     FROM student_services_audit_logs a
     JOIN users u ON u.id = a.actor_id
     WHERE a.request_id = $1
     ORDER BY a.timestamp ASC`,
    [requestId]
  );

  return { request, auditLogs: auditRes.rows };
}
