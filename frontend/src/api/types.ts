/**
 * A.E.G.I.S 4.0 — Backend API Types
 * WP-4.1.1
 *
 * These types describe the RESPONSE shapes returned by the existing Node backend.
 * They are derived by inspection of server/handler.js, server/policy.js, and
 * server/auth.js — NOT independently authoritative.
 *
 * SECURITY NOTE: These types exist for display and navigation only.
 * Authorization decisions are enforced exclusively server-side.
 * Never use these types to gate access or reveal protected data client-side.
 */

// ─── User & Auth ─────────────────────────────────────────────────────────────

/** Roles as defined in server/policy.js STAFF constant and users table constraint */
export type UserRole =
  | 'student'
  | 'HOD'
  | 'Dean'
  | 'Higher Authority'
  | 'admin';

export type AccountStatus = 'active' | 'suspended';

export type DelegatedPermission =
  | 'users.read'
  | 'users.verify'
  | 'users.roles.assign'
  | 'users.suspend'
  | 'departments.manage'
  | 'audit.read'
  | 'authorities.assign'
  | 'roster.import'
  | 'roster.conflicts.manage'
  | 'department.students.verify';

/** Shape returned by /api/me and /api/auth/google (server/handler.js userView()) */
export interface ApiUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly department: string;
  readonly department_code?: string | null;
  readonly role: UserRole;
  readonly account_status: AccountStatus;
  readonly staff_requested: boolean;
  readonly is_primary_owner?: boolean;
  readonly is_verified_student?: boolean;
  readonly roster_id?: string | null;
  readonly assigned_departments?: string[];
  readonly mfa_enrolled?: boolean;
  readonly action_pin_set?: boolean;
  readonly permissions?: DelegatedPermission[];
}

// ─── Complaint & Cases ───────────────────────────────────────────────────────

/** Severity values as defined in migrations/001_stage3.sql CHECK constraint */
export type Severity = 'Low' | 'Moderate' | 'Critical';

/** Urgency values as defined in migrations/001_stage3.sql CHECK constraint */
export type Urgency = 'Routine' | 'Urgent' | 'Immediate Danger';

/** Authority tiers as defined in policy.js STAFF constant */
export type AuthorityTier = 'HOD' | 'Dean' | 'Higher Authority';

/** Complaint status workflow values */
export type ComplaintStatus =
  | 'Pending'
  | 'Escalated'
  | 'In Review'
  | 'Under Investigation'
  | 'Action Taken'
  | 'Resolved';

/** Verification workflow status */
export type VerificationStatus =
  | 'Submitted'
  | 'Identity Verified'
  | 'Evidence Pending'
  | 'Under Review'
  | 'Additional Information Requested'
  | 'Findings Recorded'
  | 'Resolved';

export type EvidenceStatus = 'Pending' | 'Authenticity Confirmed' | 'Inconclusive';

export type AllegationStatus =
  | 'Unreviewed'
  | 'Substantiated'
  | 'Not Substantiated'
  | 'Inconclusive';

export type IdentityMode = 'anonymous' | 'confidential' | 'standard';

/**
 * Safe complaint shape as serialized by server/policy.js safeComplaint().
 * Owner user ID, reporter identity, and private notes are excluded server-side.
 */
export interface ApiComplaint {
  readonly id: string;
  readonly reference_id: string;
  readonly case_id: string;
  readonly category: string;
  readonly description: string;
  readonly severity: Severity;
  readonly urgency: Urgency;
  readonly assigned_authority: AuthorityTier;
  readonly status: ComplaintStatus;
  readonly verification_status: VerificationStatus;
  readonly identity_status: string;
  readonly evidence_status: EvidenceStatus;
  readonly allegation_status: AllegationStatus;
  readonly identity_mode: IdentityMode;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Verification review entry (visible to authority and admin only) */
export interface VerificationReview {
  readonly decision: string;
  readonly notes: string;
  readonly reviewed_at: string;
}

// ─── Submission Payloads ─────────────────────────────────────────────────────

/** Categories allowed by server/handler.js POST /api/complaints */
export const COMPLAINT_CATEGORIES = [
  'Ragging & Physical Intimidation',
  'Physical Violence & Assault',
  'Sexual Harassment & Coercion',
  'Hostel Harassment & Bullying',
  'Laboratory Safety & Coercion',
  'Cyber Harassment & Digital Abuse',
  'Academic Bias & Retaliation',
  'General Campus Grievance',
  'Other Campus Grievance',
] as const;

export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export interface RiskFlags {
  immediateDanger?: boolean;
  physicalThreat?: boolean;
  retaliation?: boolean;
  repeatHarassment?: boolean;
}

export interface SubmitComplaintPayload {
  category: ComplaintCategory;
  description: string;
  identityMode: IdentityMode;
  riskFlags: RiskFlags;
  linkedComplaintId?: string;
}

// ─── Config & Health ──────────────────────────────────────────────────────────

/** Shape returned by GET /api/config */
export interface ApiConfig {
  readonly ready: boolean;
  readonly configured: boolean;
  readonly googleClientId: string | null;
  readonly intakeEnabled: boolean;
}

/** Shape returned by GET /api/health */
export interface ApiHealth {
  readonly status: 'ok';
  readonly intakeEnabled: boolean;
}

// ─── Admin ────────────────────────────────────────────────────────────────────

/** Admin user listing entry from GET /api/admin/users */
export interface AdminUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly department: string;
  readonly department_code?: string | null;
  readonly role: UserRole;
  readonly account_status: AccountStatus;
  readonly staff_requested: boolean;
  readonly is_primary_owner?: boolean;
  readonly is_verified_student?: boolean;
  readonly assigned_departments?: string[];
  readonly mfa_enrolled?: boolean;
  readonly action_pin_set?: boolean;
  readonly permissions?: DelegatedPermission[];
}

export interface MfaSetupResponse {
  readonly secret: string;
  readonly uri: string;
  readonly recoveryCodes: string[];
}

export interface StepUpResponse {
  readonly verified: boolean;
  readonly stepUpToken: string;
}

export interface AdminInvitationResponse {
  readonly email: string;
  readonly inviteToken: string;
  readonly expiresInHours: number;
}

/** Audit log entry from GET /api/admin/audit */
export interface AuditLog {
  readonly id: string;
  readonly actor_id: string | null;
  readonly complaint_id: string | null;
  readonly action: string;
  readonly details: Record<string, unknown>;
  readonly timestamp: string;
}

// ─── Stage 5.5A: Student Verification & Institutional Rosters ────────────────
export interface StudentVerificationStatusResponse {
  readonly isVerified: boolean;
  readonly roster: {
    readonly registerNumber: string;
    readonly departmentCode: string;
  } | null;
  readonly activeRequest: {
    readonly id: string;
    readonly user_id: string;
    readonly roster_id: string;
    readonly status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
    readonly claim_channel: string;
    readonly notes: string | null;
    readonly created_at: string;
    readonly expires_at: string;
    readonly register_number: string;
    readonly department_code: string;
    readonly department_name: string;
  } | null;
}

export interface StudentVerificationRequestPayload {
  registerNumber: string;
  notes?: string | undefined;
}

export interface StudentVerificationRequestResponse {
  readonly status: 'APPROVED' | 'PENDING';
  readonly registerNumber: string;
  readonly departmentCode: string;
  readonly autoApproved?: boolean;
  readonly expiresAt?: string;
}

export interface AuthorityStudentRequestItem {
  readonly id: string;
  readonly user_id: string;
  readonly status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  readonly claim_channel: string;
  readonly notes: string | null;
  readonly identity_evidence_reference: string | null;
  readonly created_at: string;
  readonly expires_at: string;
  readonly user_email: string;
  readonly user_name: string;
  readonly register_number: string;
  readonly institutional_email: string;
  readonly roster_name: string;
  readonly department_code: string;
  readonly batch_year: string;
  readonly department_name: string;
}

export interface AuthorityStudentReviewPayload {
  stepUpToken?: string;
  decision: 'APPROVED' | 'REJECTED';
  notes: string;
  identityEvidenceReference?: string | undefined;
  verificationMethod?: 'IN_PERSON_COLLEGE_ID' | 'PHYSICAL_OFFICE_VERIFICATION' | 'DEPT_ACADEMIC_RECORD' | 'FACULTY_ADVISOR_CONFIRMATION' | undefined;
}

export interface RosterRecordInput {
  registerNumber: string;
  institutionalEmail: string;
  fullName: string;
  departmentCode: string;
  batchYear?: string;
  degreeProgram?: string;
}

export interface RosterImportResponse {
  readonly batchId: string;
  readonly totalProcessed: number;
  readonly importedCount: number;
  readonly conflictsQuarantined: number;
}

export interface RosterConflictItem {
  readonly id: string;
  readonly batch_id: string;
  readonly register_number: string;
  readonly institutional_email: string;
  readonly department_code: string;
  readonly conflict_type: string;
  readonly raw_payload: any;
  readonly resolved: boolean;
  readonly resolution_action: string | null;
  readonly resolution_notes: string | null;
  readonly created_at: string;
}

export interface AdminDepartmentItem {
  readonly code: string;
  readonly name: string;
  readonly active: boolean;
  readonly created_at: string;
}

export interface AdminAuthorityAssignmentItem {
  readonly id: string;
  readonly user_id: string;
  readonly role: 'HOD' | 'Dean' | 'Higher Authority';
  readonly department_code: string;
  readonly department_name: string;
  readonly email: string;
  readonly name: string;
  readonly active: boolean;
  readonly assigned_at: string;
}

// ─── Stage 5.5B / G09.1: Hybrid Institutional Verification ────────────────
export interface InstitutionItem {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly active: boolean;
  readonly domains: string[];
  readonly supported_methods: string[];
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateInstitutionInput {
  slug: string;
  name: string;
  domains: string[];
  supportedMethods?: string[];
  active?: boolean;
  stepUpToken?: string;
}

export interface UpdateInstitutionInput {
  name?: string;
  domains?: string[];
  supportedMethods?: string[];
  active?: boolean;
  stepUpToken?: string;
}

export interface VerificationClaimItem {
  readonly id: string;
  readonly user_id: string;
  readonly roster_id: string;
  readonly status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  readonly claim_channel: string;
  readonly notes: string | null;
  readonly identity_evidence_reference: string | null;
  readonly created_at: string;
  readonly expires_at: string;
  readonly user_email: string;
  readonly user_name: string;
  readonly register_number: string;
  readonly institutional_email: string;
  readonly roster_name: string;
  readonly department_code: string;
  readonly batch_year: string;
  readonly department_name: string;
  readonly approved_personal_email?: string | null;
  readonly is_test_record?: boolean;
  readonly institution_id?: string | null;
  readonly institution_name?: string | null;
  readonly institution_slug?: string | null;
  readonly binding_conflict?: boolean;
  readonly bound_to_other_user?: boolean;
  readonly bound_to_other_roster?: boolean;
}

export interface RosterPreviewResponse {
  readonly total: number;
  readonly validCount: number;
  readonly errorCount: number;
  readonly conflictCount: number;
  readonly validSample: Array<{
    registerNumber: string;
    institutionalEmail: string;
    fullName: string;
    departmentCode: string;
    batchYear: string;
    degreeProgram?: string;
    approvedPersonalEmail?: string;
    isTestRecord?: boolean;
  }>;
  readonly errors: Array<{
    row: number;
    record: any;
    error: string;
  }>;
}

// ─── API Error ────────────────────────────────────────────────────────────────

export interface ApiError {
  readonly error: string;
}

