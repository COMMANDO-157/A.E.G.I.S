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

/** Shape returned by /api/me and /api/auth/google (server/handler.js userView()) */
export interface ApiUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly department: string;
  readonly role: UserRole;
  readonly account_status: AccountStatus;
  readonly staff_requested: boolean;
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
  readonly role: UserRole;
  readonly account_status: AccountStatus;
  readonly staff_requested: boolean;
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

// ─── API Error ────────────────────────────────────────────────────────────────

export interface ApiError {
  readonly error: string;
}
