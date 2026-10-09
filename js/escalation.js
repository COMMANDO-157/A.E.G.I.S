/**
 * A.E.G.I.S — Escalation & Rule-Based Routing Engine
 * Dual-Engine Decision Rule:
 *   Final Tier = MAX(Severity Tier, Repeat-Report Tier, Current Case Tier)
 * 
 * Tracks Severity and Urgency independently.
 * Transparent rule-based heuristics — strictly not labeled as AI analysis.
 */

export const AUTHORITY_TIERS = {
  HOD: 'HOD',
  DEAN: 'Dean',
  HIGHER_AUTH: 'Higher Authority'
};

export const TIER_LEVELS = {
  'HOD': 1,
  'Dean': 2,
  'Higher Authority': 3
};

export const LEVEL_TO_TIER = {
  1: AUTHORITY_TIERS.HOD,
  2: AUTHORITY_TIERS.DEAN,
  3: AUTHORITY_TIERS.HIGHER_AUTH
};

export const SEVERITY_LEVELS = {
  LOW: 'Low',
  MODERATE: 'Moderate',
  CRITICAL: 'Critical'
};

export const URGENCY_LEVELS = {
  ROUTINE: 'Routine',
  URGENT: 'Urgent',
  IMMEDIATE: 'Immediate Danger'
};

const SEVERITY_TIER_MAP = {
  [SEVERITY_LEVELS.LOW]: AUTHORITY_TIERS.HOD,
  [SEVERITY_LEVELS.MODERATE]: AUTHORITY_TIERS.DEAN,
  [SEVERITY_LEVELS.CRITICAL]: AUTHORITY_TIERS.HIGHER_AUTH
};

/**
 * Transparent, deterministic rule-based risk evaluation.
 * Evaluates explicit category and risk flags as primary signals,
 * using narrative keywords with negative-assertion safeguards as supporting evidence.
 * 
 * @param {Object} input - Incident data
 * @returns {{ severity: string, urgency: string, recommendedTier: string, signals: string[], explanation: string }}
 */
export function assessIncidentRisk(input = {}) {
  const category = (input.category || '').trim();
  const description = (input.description || '').toLowerCase();
  const flags = input.riskFlags || {};
  const isPhysical = !!flags.physicalThreat;
  const isRetaliation = !!flags.retaliation;
  const isImmediate = !!flags.immediateDanger;
  const isRepeat = !!flags.repeatHarassment;

  const signals = [];

  // 1. Primary Signal: Explicit Incident Category Classification
  let categoryRisk = SEVERITY_LEVELS.LOW;
  if (
    category.includes('Ragging') ||
    category.includes('Physical Intimidation') ||
    category.includes('Physical Violence') ||
    category.includes('Sexual Harassment') ||
    category.includes('Weapons')
  ) {
    categoryRisk = SEVERITY_LEVELS.CRITICAL;
    signals.push(`High-Risk Incident Category: "${category}"`);
  } else if (
    category.includes('Hostel Harassment') ||
    category.includes('Laboratory Safety') ||
    category.includes('Cyber Harassment') ||
    category.includes('Academic Bias') ||
    category.includes('Coercion')
  ) {
    categoryRisk = SEVERITY_LEVELS.MODERATE;
    signals.push(`Moderate-Risk Incident Category: "${category}"`);
  } else {
    signals.push(`Standard Category: "${category || 'General Campus Grievance'}"`);
  }

  // 2. Primary Signal: Explicit Risk & Urgency Flags (User/Triage Asserted)
  if (isImmediate) {
    signals.push('Explicit Signal: Ongoing immediate physical danger / crisis');
  }
  if (isPhysical) {
    signals.push('Explicit Signal: Credible threat of bodily injury or physical violence');
  }
  if (isRetaliation) {
    signals.push('Explicit Signal: Retaliation or institutional coercion threat by person in power');
  }
  if (isRepeat) {
    signals.push('Explicit Signal: Chronic repeat harassment pattern identified');
  }

  // 3. Supporting Signal: Narrative Keyword Safeguarded Matching
  // Safeguard: Check for negations to prevent false positives (e.g. "no weapon", "no physical harm")
  const hasNegation = (term) => {
    const negRegex = new RegExp(`\\b(no|not|without|neither|never)\\s+([\\w\\s]{0,15})?\\b${term}\\b`, 'i');
    return negRegex.test(description);
  };

  const criticalKeywords = ['kill', 'suicide', 'weapon', 'assault', 'stab', 'beat', 'bleeding', 'hospital', 'extort'];
  const moderateKeywords = ['intimidation', 'threaten', 'threat', 'stalk', 'unauthorized photo', 'forced chore', 'confiscate', 'blackmail'];

  const matchedCritical = criticalKeywords.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(description) && !hasNegation(w));
  const matchedModerate = moderateKeywords.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(description) && !hasNegation(w));

  if (matchedCritical.length > 0) {
    signals.push(`Supporting Narrative Evidence: High-urgency terms detected [${matchedCritical.join(', ')}]`);
  }
  if (matchedModerate.length > 0) {
    signals.push(`Supporting Narrative Evidence: Coercion terms detected [${matchedModerate.join(', ')}]`);
  }

  // 4. Determine Overall Severity
  let severity = SEVERITY_LEVELS.LOW;

  if (
    categoryRisk === SEVERITY_LEVELS.CRITICAL ||
    isImmediate ||
    isPhysical ||
    (matchedCritical.length > 0 && (categoryRisk === SEVERITY_LEVELS.MODERATE || isRetaliation))
  ) {
    severity = SEVERITY_LEVELS.CRITICAL;
  } else if (
    categoryRisk === SEVERITY_LEVELS.MODERATE ||
    isRetaliation ||
    isRepeat ||
    matchedModerate.length > 0 ||
    matchedCritical.length > 0
  ) {
    severity = SEVERITY_LEVELS.MODERATE;
  }

  // 5. Determine Urgency Independently
  let urgency = URGENCY_LEVELS.ROUTINE;
  if (isImmediate || matchedCritical.includes('kill') || matchedCritical.includes('weapon')) {
    urgency = URGENCY_LEVELS.IMMEDIATE;
  } else if (isPhysical || isRetaliation || severity === SEVERITY_LEVELS.CRITICAL || matchedCritical.length > 0) {
    urgency = URGENCY_LEVELS.URGENT;
  } else if (severity === SEVERITY_LEVELS.MODERATE) {
    urgency = URGENCY_LEVELS.URGENT;
  }

  const recommendedTier = SEVERITY_TIER_MAP[severity];

  // 6. Transparent, Non-AI Explanation Generation
  let explanation = '';
  if (severity === SEVERITY_LEVELS.CRITICAL) {
    explanation = `Rule-Based Evaluation: CRITICAL RISK (${urgency} Urgency). Immediate bypass to ${recommendedTier} (Tier 3). Primary factors: ${signals.slice(0, 2).join('; ')}.`;
  } else if (severity === SEVERITY_LEVELS.MODERATE) {
    explanation = `Rule-Based Evaluation: MODERATE RISK (${urgency} Urgency). Assigned to ${recommendedTier} (Tier 2). Primary factors: ${signals.slice(0, 2).join('; ')}.`;
  } else {
    explanation = `Rule-Based Evaluation: LOW RISK (${urgency} Urgency). Departmental triage by ${recommendedTier} (Tier 1). Routine resolution path.`;
  }

  return {
    severity,
    urgency,
    recommendedTier,
    signals,
    explanation
  };
}

/**
 * Determines target authority from count of related complaints in a case group.
 * @param {number} relatedCount - Total count of reports under same case group
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
 * Core Dual-Engine Decision Rule:
 * Final Tier = MAX(Severity Tier, Repeat-Report Tier, Current Case Tier)
 * 
 * Evaluates both independent severity routing and linked-case escalation.
 * Strictly guarantees anti-downgrade behavior and case group coherence.
 * 
 * @param {Object} candidateRecord - Complaint currently being submitted
 * @param {Array<Object>} existingComplaints - Existing complaints in database
 * @returns {{ assignedAuthority: string, severity: string, urgency: string, severityReason: string, routingOrigin: string, caseComplaintsToUpdate: Array<Object>, auditEntry: Object }}
 */
export function evaluateCaseEscalation(candidateRecord, existingComplaints = []) {
  const caseGroupId = (candidateRecord.caseGroupId || '').trim();

  // 1. Evaluate Severity and Urgency
  const riskAssessment = assessIncidentRisk(candidateRecord);
  const severityTier = riskAssessment.recommendedTier;
  const severityLevel = TIER_LEVELS[severityTier] || 1;

  // 2. Evaluate Linked-Case Escalation & Existing Case Tier
  let linkedExisting = [];
  let repeatReportTier = AUTHORITY_TIERS.HOD;
  let repeatReportLevel = 1;
  let currentCaseLevel = 1;

  if (caseGroupId) {
    linkedExisting = existingComplaints.filter(c => (c.caseGroupId || '').trim() === caseGroupId);
    const totalCaseCount = linkedExisting.length + 1;
    repeatReportTier = determineTargetAuthority(totalCaseCount);
    repeatReportLevel = TIER_LEVELS[repeatReportTier] || 1;

    // Highest existing tier among already-filed complaints in this case
    if (linkedExisting.length > 0) {
      currentCaseLevel = Math.max(
        1,
        ...linkedExisting.map(c => TIER_LEVELS[c.assignedAuthority] || 1)
      );
    }
  }

  // 3. Dual-Engine Decision Rule: MAX(Severity Tier, Repeat Tier, Current Case Tier)
  const finalLevel = Math.max(severityLevel, repeatReportLevel, currentCaseLevel);
  const finalTier = LEVEL_TO_TIER[finalLevel];

  // 4. Determine Routing Origin Label
  let routingOrigin = 'Initial Triage (Low)';
  let actionName = 'INITIAL_ROUTING';

  if (finalLevel === severityLevel && severityLevel > 1 && severityLevel > repeatReportLevel) {
    routingOrigin = `Severity Bypass (${riskAssessment.severity})`;
    actionName = severityLevel === 3 ? 'CRITICAL_SEVERITY_BYPASS_TIER_3' : 'MODERATE_SEVERITY_BYPASS_TIER_2';
  } else if (finalLevel === repeatReportLevel && (linkedExisting.length + 1) > 1 && repeatReportLevel >= severityLevel) {
    const count = linkedExisting.length + 1;
    routingOrigin = `Linked Case (Report #${count})`;
    actionName = finalLevel === 3 ? 'CRITICAL_AUTO_ESCALATION_TIER_3' : 'AUTO_ESCALATION_TIER_2';
  } else if (finalLevel === currentCaseLevel && currentCaseLevel > severityLevel) {
    routingOrigin = 'Preserved Case Escalation';
    actionName = 'CASE_TIER_INHERITANCE';
  }

  // 5. Generate Audit Entry
  const auditRemarks = `${riskAssessment.explanation} [Routing: ${routingOrigin} &rarr; ${finalTier}].`;
  const auditEntry = createAuditLogEntry(
    actionName,
    finalTier,
    auditRemarks,
    'A.E.G.I.S Dual-Routing Engine'
  );

  // 6. Case Group Synchronization (Escalate existing case complaints if finalLevel > their current level)
  const caseComplaintsToUpdate = linkedExisting.map(complaint => {
    const compLevel = TIER_LEVELS[complaint.assignedAuthority] || 1;
    if (compLevel < finalLevel) {
      const updatedLogs = [...(complaint.auditLogs || [])];
      updatedLogs.push(createAuditLogEntry(
        actionName,
        finalTier,
        `Linked case group [${caseGroupId}] synchronized to ${finalTier} following new incident filing (${routingOrigin}). Full history preserved.`,
        'A.E.G.I.S Auto-Escalation Engine'
      ));
      return {
        ...complaint,
        assignedAuthority: finalTier,
        status: complaint.status === 'Resolved' ? 'Resolved' : 'Escalated',
        auditLogs: updatedLogs
      };
    }
    return complaint;
  });

  return {
    assignedAuthority: finalTier,
    severity: riskAssessment.severity,
    urgency: riskAssessment.urgency,
    severityReason: riskAssessment.explanation,
    routingOrigin,
    caseComplaintsToUpdate,
    auditEntry
  };
}

/**
 * Validates and executes a manual routing override.
 * Requires mandatory justification (min 15 chars).
 * Strictly prevents unauthorized downgrades (especially for critical severity).
 * 
 * @param {Object} complaint - Target complaint
 * @param {string} targetTier - Desired new tier
 * @param {string} overrideReason - Mandatory administrative justification
 * @param {string} actorRole - Current acting role ('HOD' | 'Dean' | 'Higher Authority')
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateManualOverride(complaint, targetTier, overrideReason, actorRole) {
  if (!overrideReason || overrideReason.trim().length < 15) {
    return {
      valid: false,
      error: 'A detailed administrative justification is mandatory for routing overrides (minimum 15 characters).'
    };
  }

  if (!canManageComplaint(complaint, actorRole)) return { valid: false, error: 'Permission denied: use assigned authority or Higher Authority.' };
  const currentLevel = TIER_LEVELS[complaint.assignedAuthority] || 1;
  const targetLevel = TIER_LEVELS[targetTier];

  if (!targetLevel) {
    return { valid: false, error: 'Invalid target authority tier specified.' };
  }

  // Downgrade protection checks
  if (targetLevel < currentLevel) {
    // Check if complaint is Critical severity
    if (complaint.severity === SEVERITY_LEVELS.CRITICAL && actorRole !== AUTHORITY_TIERS.HIGHER_AUTH) {
      return {
        valid: false,
        error: 'Unauthorized Downgrade: Critical severity complaints cannot be downgraded by Tier 1 (HOD) or Tier 2 (Dean). Requires Executive Ombudsperson action.'
      };
    }

    // Role hierarchy permission: HOD cannot downgrade Dean cases; Dean cannot downgrade Higher Authority cases
    if (actorRole === AUTHORITY_TIERS.HOD && currentLevel > 1) {
      return {
        valid: false,
        error: 'Permission Denied: HOD cannot downgrade complaints escalated to Dean or Higher Authority.'
      };
    }

    if (actorRole === AUTHORITY_TIERS.DEAN && currentLevel > 2) {
      return {
        valid: false,
        error: 'Permission Denied: Dean cannot downgrade complaints escalated to Higher Authority.'
      };
    }
  }

  return { valid: true };
}

/** Demo workflow checks only; not authentication. */
export function canManageComplaint(complaint, role) {
  return Object.values(AUTHORITY_TIERS).includes(role) &&
    (role === AUTHORITY_TIERS.HIGHER_AUTH || role === complaint.assignedAuthority);
}
export const STATUS_TRANSITIONS = Object.freeze({
  Pending: ['In Review'],
  Escalated: ['In Review', 'Under Investigation'],
  'In Review': ['Under Investigation'],
  'Under Investigation': ['Action Taken'],
  'Action Taken': ['Resolved'],
  Resolved: []
});
export function allowedStatusTransitions(complaint, role) {
  return canManageComplaint(complaint, role) ? [...(STATUS_TRANSITIONS[complaint.status] || [])] : [];
}
export function validateStatusTransition(complaint, status, remarks, role) {
  if (!canManageComplaint(complaint, role)) return { valid: false, error: 'Permission denied: use assigned authority or Higher Authority.' };
  if (!allowedStatusTransitions(complaint, role).includes(status)) return { valid: false, error: 'This status transition is not allowed.' };
  if (typeof remarks !== 'string' || !remarks.trim()) return { valid: false, error: 'Administrative remarks are required.' };
  return { valid: true };
}
