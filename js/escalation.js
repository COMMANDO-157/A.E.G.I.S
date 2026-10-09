/**
 * A.E.G.I.S — Escalation Engine
 * Handles deterministic case group routing and multi-tier escalation:
 *   - 1st related report in case: Assigned to HOD (Tier 1)
 *   - 2nd related report in case: Entire case auto-escalated to Dean (Tier 2)
 *   - 3rd+ related reports in case: Entire case escalated to Higher Authority (Tier 3)
 * Appends demo audit log entries without claiming tamper-proof cryptographic security.
 */

export const AUTHORITY_TIERS = {
  HOD: 'HOD',
  DEAN: 'Dean',
  HIGHER_AUTH: 'Higher Authority'
};

/**
 * Determines the target authority tier based on the count of related complaints in a case group.
 * @param {number} relatedCount - Total count of reports under the same case group
 * @returns {string} - 'HOD' | 'Dean' | 'Higher Authority'
 */
export function determineTargetAuthority(relatedCount) {
  if (relatedCount <= 1) {
    return AUTHORITY_TIERS.HOD;
  } else if (relatedCount === 2) {
    return AUTHORITY_TIERS.DEAN;
  } else {
    return AUTHORITY_TIERS.HIGHER_AUTH;
  }
}

/**
 * Creates an append-only demo audit log entry.
 * Note: Clearly distinguished as a client-side demonstration log.
 * 
 * @param {string} action - Brief description of action (e.g., 'INITIAL_ASSIGNMENT', 'AUTO_ESCALATION')
 * @param {string} destination - Assigned authority tier
 * @param {string} remarks - Human-readable context/explanation
 * @param {string} actor - 'System Engine' | 'HOD' | 'Dean' | 'Higher Authority'
 * @returns {Object} - Audit log entry object
 */
export function createAuditLogEntry(action, destination, remarks, actor = 'System Engine') {
  return {
    id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: new Date().toISOString(),
    displayTime: new Date().toLocaleString(),
    action,
    destination,
    actor,
    remarks,
    isDemoLog: true
  };
}

/**
 * Evaluates escalation for a new or updated complaint.
 * If multiple complaints belong to the same case group, escalates all linked complaints
 * to maintain case coherence as required.
 * 
 * @param {Object} newComplaint - Complaint currently being filed
 * @param {Array<Object>} existingComplaints - All existing complaints in the system
 * @returns {{ assignedAuthority: string, caseComplaintsToUpdate: Array<Object>, auditEntry: Object }}
 */
export function evaluateCaseEscalation(newComplaint, existingComplaints) {
  const caseGroupId = (newComplaint.caseGroupId || '').trim();

  // If no case group is specified, treat as independent singular report assigned to HOD
  if (!caseGroupId) {
    const assignedAuthority = AUTHORITY_TIERS.HOD;
    const auditEntry = createAuditLogEntry(
      'INITIAL_ROUTING',
      assignedAuthority,
      'Complaint filed independently. Assigned to HOD (Department Triage).',
      'A.E.G.I.S Engine'
    );
    return {
      assignedAuthority,
      caseComplaintsToUpdate: [],
      auditEntry
    };
  }

  // Find existing complaints sharing this caseGroupId
  const linkedExisting = existingComplaints.filter(c => c.caseGroupId === caseGroupId);
  const totalCount = linkedExisting.length + 1;
  const targetAuthority = determineTargetAuthority(totalCount);

  let reason = '';
  let action = 'INITIAL_ROUTING';

  if (totalCount === 1) {
    reason = `First report filed under demo case [${caseGroupId}]. Assigned to HOD (Department Triage).`;
    action = 'INITIAL_ROUTING';
  } else if (totalCount === 2) {
    reason = `Second related report linked to demo case [${caseGroupId}]. Case automatically escalated to Dean of Student Affairs (Tier 2).`;
    action = 'AUTO_ESCALATION_TIER_2';
  } else {
    reason = `Repeated pattern detected: ${totalCount} related reports linked to demo case [${caseGroupId}]. Entire case auto-escalated to Higher Authority / Campus Ombudsperson (Tier 3).`;
    action = 'CRITICAL_AUTO_ESCALATION_TIER_3';
  }

  const auditEntry = createAuditLogEntry(action, targetAuthority, reason, 'A.E.G.I.S Auto-Escalation Engine');

  // Prepare updates for existing linked complaints so the entire case is in sync
  const caseComplaintsToUpdate = linkedExisting.map(complaint => {
    // Only update if targetAuthority has increased
    const updatedLogs = [...(complaint.auditLogs || [])];
    if (complaint.assignedAuthority !== targetAuthority) {
      updatedLogs.push(createAuditLogEntry(
        action,
        targetAuthority,
        `Linked case updated: Synchronized to ${targetAuthority} following report #${totalCount} filing.`,
        'A.E.G.I.S Auto-Escalation Engine'
      ));
    }
    return {
      ...complaint,
      assignedAuthority: targetAuthority,
      status: complaint.status === 'Resolved' ? 'Resolved' : 'Escalated',
      auditLogs: updatedLogs
    };
  });

  return {
    assignedAuthority: targetAuthority,
    caseComplaintsToUpdate,
    auditEntry
  };
}
