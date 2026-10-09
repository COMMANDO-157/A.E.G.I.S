/**
 * A.E.G.I.S — Data Store & Demo Persistence Manager
 * Uses browser localStorage for synthetic demonstration records.
 * Prominently clarifies that this client-side store is for prototyping only.
 */

import { generateReferenceId, generateVerificationPin, isValidVerificationPin } from './security.js';
import { 
  evaluateCaseEscalation, 
  createAuditLogEntry, 
  validateManualOverride,
  validateStatusTransition,
  AUTHORITY_TIERS,
  SEVERITY_LEVELS,
  URGENCY_LEVELS
} from './escalation.js';

const STORAGE_KEY = 'aegis_demo_complaints_v1';

// Seed initial fictional demonstration dataset with severity & urgency attributes
const INITIAL_DEMO_COMPLAINTS = [
  {
    id: 'COMP-101',
    referenceId: 'AEG-2026-X7K2',
    verificationPin: '482910', // Clearly labeled demo PIN
    incidentType: 'Offline (Campus)',
    category: 'Hostel Harassment & Bullying',
    dateTime: '2026-10-05T21:30',
    location: 'Block-B 3rd Floor Common Hall',
    description: 'Senior students gathered outside Room 314 demanding junior students perform unauthorized chores and surrender notebooks.',
    suspectName: 'Hostel Wing Representative',
    suspectDepartment: 'Mechanical Engineering, 4th Year',
    suspectPhone: '+91 98765 43210 (Fictional)',
    identityMode: 'anonymous',
    reporterName: '',
    reporterContact: '',
    reporterDepartment: '',
    caseGroupId: 'CASE-HOSTEL-B',
    severity: SEVERITY_LEVELS.MODERATE,
    urgency: URGENCY_LEVELS.URGENT,
    severityReason: 'Rule-Based Evaluation: MODERATE RISK (Urgent Urgency). Category [Hostel Harassment & Bullying].',
    routingOrigin: 'Severity Bypass (Moderate)',
    assignedAuthority: AUTHORITY_TIERS.DEAN,
    status: 'In Review',
    createdAt: '2026-10-06T09:15:00.000Z',
    evidenceFile: null,
    auditLogs: [
      {
        id: 'LOG-1',
        timestamp: '2026-10-06T09:15:00.000Z',
        displayTime: '06 Oct 2026, 09:15 AM',
        action: 'MODERATE_SEVERITY_BYPASS_TIER_2',
        destination: AUTHORITY_TIERS.DEAN,
        actor: 'A.E.G.I.S Dual-Routing Engine',
        remarks: 'Rule-Based Evaluation: MODERATE RISK. Category [Hostel Harassment & Bullying] routed directly to Dean.',
        isDemoLog: true
      }
    ]
  },
  {
    id: 'COMP-102',
    referenceId: 'AEG-2026-P9R4',
    verificationPin: '820145',
    incidentType: 'Online (Digital)',
    category: 'Cyber Harassment & Digital Abuse',
    dateTime: '2026-10-07T14:10',
    location: 'Unofficial Campus Discord Server & WhatsApp Group',
    description: 'Altered screenshots with derogatory comments regarding class presentations were distributed across departmental messaging channels.',
    suspectName: 'Anonymous Discord Handle #CampusEcho',
    suspectDepartment: 'Computer Science, 3rd Year',
    suspectPhone: '',
    identityMode: 'confidential',
    reporterName: 'Ananya Sharma (Demo Persona)',
    reporterContact: 'ananya.demo@campus.edu',
    reporterDepartment: 'Computer Science, 2nd Year',
    caseGroupId: 'CASE-CYBER-DISCORD',
    severity: SEVERITY_LEVELS.MODERATE,
    urgency: URGENCY_LEVELS.URGENT,
    severityReason: 'Rule-Based Evaluation: MODERATE RISK. Category [Cyber Harassment & Digital Abuse].',
    routingOrigin: 'Severity Bypass (Moderate)',
    assignedAuthority: AUTHORITY_TIERS.DEAN,
    status: 'In Review',
    createdAt: '2026-10-07T15:00:00.000Z',
    evidenceFile: {
      name: 'screenshot_evidence_redacted.png',
      size: 348160,
      sizeFormatted: '340 KB',
      type: 'image/png',
      isDemoSimulation: true
    },
    auditLogs: [
      {
        id: 'LOG-2',
        timestamp: '2026-10-07T15:00:00.000Z',
        displayTime: '07 Oct 2026, 03:00 PM',
        action: 'MODERATE_SEVERITY_BYPASS_TIER_2',
        destination: AUTHORITY_TIERS.DEAN,
        actor: 'A.E.G.I.S Dual-Routing Engine',
        remarks: 'Confidential complaint filed. Identity masked for Tier 1 HOD and Tier 2 Dean. Assigned to Dean.',
        isDemoLog: true
      }
    ]
  },
  {
    id: 'COMP-103',
    referenceId: 'AEG-2026-M3W9',
    verificationPin: '319482',
    incidentType: 'Offline (Campus)',
    category: 'Laboratory Safety & Coercion',
    dateTime: '2026-10-04T16:00',
    location: 'Advanced Chemistry Lab 2, Main Science Block',
    description: 'Hostile disruption of assigned experiment bench, deliberate withholding of safety goggles and calibration kits.',
    suspectName: 'Lab Group Captain',
    suspectDepartment: 'Chemical Engineering',
    suspectPhone: '',
    identityMode: 'standard',
    reporterName: 'Rohan Verma (Demo Persona)',
    reporterContact: '+91 91234 56789',
    reporterDepartment: 'Chemical Engineering, 2nd Year',
    caseGroupId: 'CASE-CHEM-LAB-REPEAT',
    severity: SEVERITY_LEVELS.MODERATE,
    urgency: URGENCY_LEVELS.URGENT,
    severityReason: 'Rule-Based Evaluation: MODERATE RISK. Category [Laboratory Safety & Coercion].',
    routingOrigin: 'Linked Case (Report #2)',
    assignedAuthority: AUTHORITY_TIERS.DEAN,
    status: 'Escalated',
    createdAt: '2026-10-04T17:30:00.000Z',
    evidenceFile: null,
    auditLogs: [
      {
        id: 'LOG-3A',
        timestamp: '2026-10-04T17:30:00.000Z',
        displayTime: '04 Oct 2026, 05:30 PM',
        action: 'INITIAL_ROUTING',
        destination: AUTHORITY_TIERS.HOD,
        actor: 'A.E.G.I.S Engine',
        remarks: 'Report #1 filed under case [CASE-CHEM-LAB-REPEAT]. Assigned to HOD.',
        isDemoLog: true
      },
      {
        id: 'LOG-3B',
        timestamp: '2026-10-08T11:00:00.000Z',
        displayTime: '08 Oct 2026, 11:00 AM',
        action: 'AUTO_ESCALATION_TIER_2',
        destination: AUTHORITY_TIERS.DEAN,
        actor: 'A.E.G.I.S Auto-Escalation Engine',
        remarks: 'Second complaint received in case [CASE-CHEM-LAB-REPEAT]. Entire case escalated to Dean of Student Affairs.',
        isDemoLog: true
      }
    ]
  },
  {
    id: 'COMP-104',
    referenceId: 'AEG-2026-K4V1',
    verificationPin: '741258',
    incidentType: 'Offline (Campus)',
    category: 'Laboratory Safety & Coercion',
    dateTime: '2026-10-08T10:45',
    location: 'Chemical Storage Corridors, Floor 1',
    description: 'Second student reporting intimidation by the same lab group over chemical requisitions and forced work.',
    suspectName: 'Lab Group Captain',
    suspectDepartment: 'Chemical Engineering',
    suspectPhone: '',
    identityMode: 'anonymous',
    reporterName: '',
    reporterContact: '',
    reporterDepartment: '',
    caseGroupId: 'CASE-CHEM-LAB-REPEAT',
    severity: SEVERITY_LEVELS.MODERATE,
    urgency: URGENCY_LEVELS.URGENT,
    severityReason: 'Rule-Based Evaluation: MODERATE RISK. Category [Laboratory Safety & Coercion].',
    routingOrigin: 'Linked Case (Report #2)',
    assignedAuthority: AUTHORITY_TIERS.DEAN,
    status: 'Escalated',
    createdAt: '2026-10-08T11:00:00.000Z',
    evidenceFile: null,
    auditLogs: [
      {
        id: 'LOG-4',
        timestamp: '2026-10-08T11:00:00.000Z',
        displayTime: '08 Oct 2026, 11:00 AM',
        action: 'AUTO_ESCALATION_TIER_2',
        destination: AUTHORITY_TIERS.DEAN,
        actor: 'A.E.G.I.S Auto-Escalation Engine',
        remarks: 'Second complaint filed for [CASE-CHEM-LAB-REPEAT]. Escalated directly to Dean.',
        isDemoLog: true
      }
    ]
  }
];

export class AegisStore {
  constructor(storage = null) {
    this.storage = storage;
    this.lastError = null;
    try {
      this.storage ||= globalThis.localStorage;
      if (!this.storage) throw new Error('Browser storage unavailable');
      this.init();
    } catch (error) {
      this.lastError = 'Demo storage is unavailable. Enable browser storage and reload.';
    }
  }

  init() {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw === null) this.resetToSeedData();
  }

  writeComplaints(records) {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(records));
      this.lastError = null;
    } catch (error) {
      this.lastError = 'Could not save demo records. Storage may be full or unavailable. No success was recorded.';
      throw new Error(this.lastError);
    }
  }

  resetToSeedData() {
    this.writeComplaints(INITIAL_DEMO_COMPLAINTS);
  }

  readComplaints() {
    try {
      if (!this.storage) throw new Error('Storage unavailable');
      const raw = this.storage.getItem(STORAGE_KEY);
      if (raw === null) throw new Error('Missing demo records');
      const list = JSON.parse(raw);
      if (!Array.isArray(list) || list.some(c => !c || typeof c !== 'object' ||
        typeof c.id !== 'string' || typeof c.referenceId !== 'string' ||
        typeof c.verificationPin !== 'string')) throw new Error('Invalid records');
      this.lastError = null;
      return list.map(c => ({
        ...c,
        severity: c.severity || SEVERITY_LEVELS.LOW,
        urgency: c.urgency || URGENCY_LEVELS.ROUTINE,
        severityReason: c.severityReason || 'Standard procedural evaluation.',
        routingOrigin: c.routingOrigin || 'Initial Triage Routing'
      }));
    } catch (error) {
      this.lastError = 'Could not read demo records. Existing storage has been preserved; no automatic reset was performed.';
      throw new Error(this.lastError);
    }
  }

  getComplaints() {
    try { return this.readComplaints(); } catch { return []; }
  }

  getComplaintById(id) {
    const list = this.getComplaints();
    return list.find(c => c.id === id) || null;
  }

  /**
   * Tracks complaint by requiring both Reference ID and separate demo verification PIN.
   */
  getComplaintByCredentials(referenceId, pin) {
    if (typeof referenceId !== 'string' || typeof pin !== 'string' || !isValidVerificationPin(pin.trim())) return null;
    const cleanRef = referenceId.trim().toUpperCase();
    const cleanPin = pin.trim();
    const list = this.getComplaints();
    return list.find(c => 
      c.referenceId.toUpperCase() === cleanRef && 
      c.verificationPin === cleanPin
    ) || null;
  }

  /**
   * Returns list of existing case group IDs for dropdown/selector.
   */
  getExistingCaseGroups() {
    const list = this.getComplaints();
    const groups = new Set();
    list.forEach(c => {
      if (c.caseGroupId) groups.add(c.caseGroupId.trim().toUpperCase());
    });
    return Array.from(groups);
  }

  /**
   * Saves a new complaint, applies Dual-Engine Escalation (MAX of Severity, Repeat, and Case Tier),
   * synchronizes case group members, and appends demo audit logs.
   * 
   * @param {Object} input - Complaint form data
   * @returns {Object} - Created complaint record
   */
  saveComplaint(input) {
    const complaints = this.readComplaints();
    const referenceId = generateReferenceId(complaints.map(c => c.referenceId));
    let newId = 'COMP-' + Date.now() + '-' + referenceId;
    while (complaints.some(c => c.id === newId)) newId += '-1';
    const verificationPin = generateVerificationPin();

    const candidateRecord = {
      id: newId,
      referenceId,
      verificationPin,
      incidentType: input.incidentType || 'Offline (Campus)',
      category: input.category,
      dateTime: input.dateTime,
      location: input.location,
      description: input.description,
      suspectName: input.suspectName || '',
      suspectDepartment: input.suspectDepartment || '',
      suspectPhone: input.suspectPhone || '',
      identityMode: input.identityMode || 'anonymous',
      reporterName: input.identityMode === 'anonymous' ? '' : (input.reporterName || ''),
      reporterContact: input.identityMode === 'anonymous' ? '' : (input.reporterContact || ''),
      reporterDepartment: input.identityMode === 'anonymous' ? '' : (input.reporterDepartment || ''),
      caseGroupId: input.caseGroupId ? input.caseGroupId.trim().toUpperCase() : '',
      riskFlags: input.riskFlags || {},
      status: 'Pending',
      createdAt: new Date().toISOString(),
      evidenceFile: input.evidenceFile || null,
      auditLogs: []
    };

    // Evaluate dual-engine decision rule
    const { 
      assignedAuthority, 
      severity, 
      urgency, 
      severityReason, 
      routingOrigin, 
      caseComplaintsToUpdate, 
      auditEntry 
    } = evaluateCaseEscalation(candidateRecord, complaints);

    candidateRecord.assignedAuthority = assignedAuthority;
    candidateRecord.severity = severity;
    candidateRecord.urgency = urgency;
    candidateRecord.severityReason = severityReason;
    candidateRecord.routingOrigin = routingOrigin;
    candidateRecord.status = assignedAuthority === AUTHORITY_TIERS.HOD ? 'Pending' : 'Escalated';
    candidateRecord.auditLogs = [auditEntry];

    // Synchronize existing complaints in case group if escalated
    const updatedAll = complaints.map(c => {
      const match = caseComplaintsToUpdate.find(u => u.id === c.id);
      return match || c;
    });

    updatedAll.unshift(candidateRecord);
    this.writeComplaints(updatedAll);

    return candidateRecord;
  }

  /**
   * Authority action to update complaint status with append-only demo audit log.
   */
  updateComplaintStatus(id, newStatus, remarks, authorityRole) {
    const complaints = this.readComplaints();
    const index = complaints.findIndex(c => c.id === id);
    if (index === -1) throw new Error('Complaint record not found.');

    const complaint = complaints[index];
    const validation = validateStatusTransition(complaint, newStatus, remarks, authorityRole);
    if (!validation.valid) throw new Error(validation.error);
    const log = createAuditLogEntry(
      'STATUS_UPDATE',
      complaint.assignedAuthority,
      `Status updated to "${newStatus}" by ${authorityRole}. Remarks: ${remarks || 'None'}`,
      authorityRole
    );

    complaint.status = newStatus;
    complaint.auditLogs = [...(complaint.auditLogs || []), log];

    complaints[index] = complaint;
    this.writeComplaints(complaints);
    return complaint;
  }

  /**
   * Manual Routing Override by an authorized authority.
   * Validates downgrade restrictions, prevents unauthorized downgrades of Critical incidents,
   * synchronizes case groups, and logs mandatory rationale.
   */
  overrideComplaintRouting(id, targetTier, overrideReason, actorRole) {
    const complaints = this.readComplaints();
    const target = complaints.find(c => c.id === id);
    if (!target) return { success: false, error: 'Complaint record not found.' };

    const caseId = (target.caseGroupId || '').trim().toUpperCase();
    const members = complaints.filter(c => c.id === id || (caseId &&
      (c.caseGroupId || '').trim().toUpperCase() === caseId));
    // Validate every member before constructing or persisting any changes.
    for (const member of members) {
      const validation = validateManualOverride(member, targetTier, overrideReason, actorRole);
      if (!validation.valid) return { success: false, error: member.referenceId + ': ' + validation.error };
    }

    const updated = complaints.map(c => {
      // Apply the validated override atomically to every linked member.
      const isTarget = c.id === id;
      const isLinkedCaseMember = caseId && (c.caseGroupId || '').trim().toUpperCase() === caseId;

      if (isTarget || isLinkedCaseMember) {
        const logReason = 'Manual Routing Override: Rerouted from ' + c.assignedAuthority + ' to ' + targetTier + ' by ' + actorRole + '. Justification: ' + overrideReason.trim();
        const log = createAuditLogEntry('MANUAL_ROUTING_OVERRIDE', targetTier, logReason, actorRole);
        return {
          ...c,
          assignedAuthority: targetTier,
          routingOrigin: `Manual Override (${actorRole})`,
          status: ['Pending', 'Escalated'].includes(c.status) && targetTier !== AUTHORITY_TIERS.HOD ? 'Escalated' : c.status,
          auditLogs: [...(c.auditLogs || []), log]
        };
      }
      return c;
    });

    this.writeComplaints(updated);
    return { success: true, complaint: this.getComplaintById(id) };
  }

  /**
   * Manually escalates a complaint and all linked case members to a higher authority tier.
   */
  manualEscalate(id, targetAuthority, remarks, authorityRole) {
    return this.overrideComplaintRouting(id, targetAuthority, remarks, authorityRole);
  }
}

export const store = new AegisStore();
