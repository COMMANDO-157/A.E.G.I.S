/**
 * A.E.G.I.S — Data Store & Demo Persistence Manager
 * Uses browser localStorage for synthetic demonstration records.
 * Prominently clarifies that this client-side store is for prototyping only.
 */

import { generateReferenceId, generateVerificationPin } from './security.js';
import { evaluateCaseEscalation, createAuditLogEntry, AUTHORITY_TIERS } from './escalation.js';

const STORAGE_KEY = 'aegis_demo_complaints_v1';

// Seed initial fictional demonstration dataset
const INITIAL_DEMO_COMPLAINTS = [
  {
    id: 'COMP-101',
    referenceId: 'AEG-2026-X7K2',
    verificationPin: '482910', // Clearly labeled demo PIN
    incidentType: 'Offline (Campus)',
    category: 'Hostel Harassment & Curfew Bullying',
    dateTime: '2026-10-05T21:30',
    location: 'Block-B 3rd Floor Common Hall',
    description: 'Senior students gathered outside Room 314 demanding junior students perform unauthorized physical chores and surrender study materials.',
    suspectName: 'Hostel Wing Representative',
    suspectDepartment: 'Mechanical Engineering, 4th Year',
    suspectPhone: '+91 98765 43210 (Fictional)',
    identityMode: 'anonymous',
    reporterName: '',
    reporterContact: '',
    reporterDepartment: '',
    caseGroupId: 'CASE-HOSTEL-B',
    assignedAuthority: AUTHORITY_TIERS.HOD,
    status: 'In Review',
    createdAt: '2026-10-06T09:15:00.000Z',
    evidenceFile: null,
    auditLogs: [
      {
        id: 'LOG-1',
        timestamp: '2026-10-06T09:15:00.000Z',
        displayTime: '06 Oct 2026, 09:15 AM',
        action: 'INITIAL_ROUTING',
        destination: AUTHORITY_TIERS.HOD,
        actor: 'A.E.G.I.S Engine',
        remarks: 'Report #1 filed under case [CASE-HOSTEL-B]. Assigned to HOD (Department Triage).',
        isDemoLog: true
      }
    ]
  },
  {
    id: 'COMP-102',
    referenceId: 'AEG-2026-P9R4',
    verificationPin: '820145',
    incidentType: 'Online (Digital)',
    category: 'Cyber Harassment & Unauthorized Image Sharing',
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
    assignedAuthority: AUTHORITY_TIERS.HOD,
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
        action: 'INITIAL_ROUTING',
        destination: AUTHORITY_TIERS.HOD,
        actor: 'A.E.G.I.S Engine',
        remarks: 'Confidential complaint filed. Identity masked for Tier 1 HOD. Assigned to HOD.',
        isDemoLog: true
      }
    ]
  },
  {
    id: 'COMP-103',
    referenceId: 'AEG-2026-M3W9',
    verificationPin: '319482',
    incidentType: 'Offline (Campus)',
    category: 'Laboratory Intimidation & Safety Protocol Violation',
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
    category: 'Laboratory Intimidation & Safety Protocol Violation',
    dateTime: '2026-10-08T10:45',
    location: 'Chemical Storage Corridors, Floor 1',
    description: 'Second student reporting intimidation by the same lab group over chemical requisitions.',
    suspectName: 'Lab Group Captain',
    suspectDepartment: 'Chemical Engineering',
    suspectPhone: '',
    identityMode: 'anonymous',
    reporterName: '',
    reporterContact: '',
    reporterDepartment: '',
    caseGroupId: 'CASE-CHEM-LAB-REPEAT',
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

class AegisStore {
  constructor() {
    this.init();
  }

  init() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this.resetToSeedData();
    }
  }

  resetToSeedData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DEMO_COMPLAINTS));
  }

  getComplaints() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Failed reading demo complaints from localStorage', e);
      return [];
    }
  }

  getComplaintById(id) {
    const list = this.getComplaints();
    return list.find(c => c.id === id) || null;
  }

  /**
   * Tracks complaint by requiring both Reference ID and separate demo verification PIN.
   */
  getComplaintByCredentials(referenceId, pin) {
    if (!referenceId || !pin) return null;
    const cleanRef = referenceId.trim().toUpperCase();
    const cleanPin = pin.trim();
    const list = this.getComplaints();
    return list.find(c => 
      c.referenceId.toUpperCase() === cleanRef && 
      c.verificationPin === cleanPin
    ) || null;
  }

  /**
   * Returns list of existing case group IDs for the dropdown/selector.
   */
  getExistingCaseGroups() {
    const list = this.getComplaints();
    const groups = new Set();
    list.forEach(c => {
      if (c.caseGroupId) groups.add(c.caseGroupId);
    });
    return Array.from(groups);
  }

  /**
   * Saves a new complaint, applies escalation engine, updates any linked reports in the case,
   * and appends demo audit logs.
   * 
   * @param {Object} input - Complaint form data
   * @returns {Object} - Created complaint record
   */
  saveComplaint(input) {
    const complaints = this.getComplaints();
    const newId = `COMP-${Date.now().toString().slice(-5)}`;
    const referenceId = generateReferenceId();
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
      status: 'Pending',
      createdAt: new Date().toISOString(),
      evidenceFile: input.evidenceFile || null,
      auditLogs: []
    };

    // Evaluate escalation engine
    const { assignedAuthority, caseComplaintsToUpdate, auditEntry } = evaluateCaseEscalation(
      candidateRecord,
      complaints
    );

    candidateRecord.assignedAuthority = assignedAuthority;
    candidateRecord.status = assignedAuthority === AUTHORITY_TIERS.HOD ? 'Pending' : 'Escalated';
    candidateRecord.auditLogs = [auditEntry];

    // Synchronize existing complaints in case group if escalated
    const updatedAll = complaints.map(c => {
      const match = caseComplaintsToUpdate.find(u => u.id === c.id);
      return match || c;
    });

    updatedAll.unshift(candidateRecord);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedAll));

    return candidateRecord;
  }

  /**
   * Authority action to update complaint status with append-only demo audit log.
   */
  updateComplaintStatus(id, newStatus, remarks, authorityRole) {
    const complaints = this.getComplaints();
    const index = complaints.findIndex(c => c.id === id);
    if (index === -1) return null;

    const complaint = complaints[index];
    const log = createAuditLogEntry(
      'STATUS_UPDATE',
      complaint.assignedAuthority,
      `Status updated to "${newStatus}" by ${authorityRole}. Remarks: ${remarks || 'None'}`,
      authorityRole
    );

    complaint.status = newStatus;
    complaint.auditLogs = [...(complaint.auditLogs || []), log];

    complaints[index] = complaint;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(complaints));
    return complaint;
  }

  /**
   * Manually escalates a complaint and all linked case members to a higher authority tier.
   */
  manualEscalate(id, targetAuthority, remarks, authorityRole) {
    const complaints = this.getComplaints();
    const target = complaints.find(c => c.id === id);
    if (!target) return null;

    const caseId = target.caseGroupId;
    const logReason = `Manual escalation to ${targetAuthority} triggered by ${authorityRole}. Reason: ${remarks || 'Administrative review decision'}`;

    const updated = complaints.map(c => {
      // Escalate target or all members of the case group if grouped
      const shouldEscalate = c.id === id || (caseId && c.caseGroupId === caseId);
      if (shouldEscalate) {
        const log = createAuditLogEntry('MANUAL_ESCALATION', targetAuthority, logReason, authorityRole);
        return {
          ...c,
          assignedAuthority: targetAuthority,
          status: 'Escalated',
          auditLogs: [...(c.auditLogs || []), log]
        };
      }
      return c;
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return this.getComplaintById(id);
  }
}

export const store = new AegisStore();
