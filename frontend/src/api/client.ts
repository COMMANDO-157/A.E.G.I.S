/**
 * A.E.G.I.S 4.0 — Hardened Typed API Client
 * WP-4.1.4 | Protected Routing & Authorization Foundation
 *
 * Same-origin HTTP client for the Node backend.
 * Uses HttpOnly cookies exclusively (no localStorage/sessionStorage auth tokens).
 * Enforces typed errors, AbortSignal cancellation, rate-limit header parsing,
 * safe content-type handling, and distinct session error identification.
 */

import type {
  ApiUser,
  ApiConfig,
  ApiComplaint,
  AdminUser,
  AuditLog,
  VerificationReview,
  SubmitComplaintPayload,
} from './types';

// ─── Error Classes ────────────────────────────────────────────────────────────

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfter?: number | undefined,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export class SessionExpiredError extends ApiRequestError {
  constructor(message = 'Session expired. Please sign in again.') {
    super(401, message);
    this.name = 'SessionExpiredError';
  }
}

export class AccountSuspendedError extends ApiRequestError {
  constructor(message = 'Your institutional account has been suspended.') {
    super(401, message);
    this.name = 'AccountSuspendedError';
  }
}

export class ApiNetworkError extends Error {
  constructor(message = 'Backend unavailable. Please check your network connection.') {
    super(message);
    this.name = 'ApiNetworkError';
  }
}

export class ApiParseError extends Error {
  constructor(message = 'Backend returned an unexpected response format.') {
    super(message);
    this.name = 'ApiParseError';
  }
}

// ─── Core Fetch Wrapper ────────────────────────────────────────────────────────

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | undefined;
  body?: unknown;
  signal?: AbortSignal | undefined;
}

let ownerGrant: string | null = null;
export function setOwnerGrant(value: string | null) { ownerGrant = value; }
export function releaseOwnerGrant() {
 const grant=ownerGrant; ownerGrant=null;
 if(grant) void fetch('/api/owner/entry/exit',{method:'POST',credentials:'same-origin',keepalive:true,
  headers:{'Content-Type':'application/json','X-Aegis-Owner-Grant':grant},body:'{}'}).catch(()=>{});
}
export const startOwnerEntry = (pin?: string) => request<{challengeId: string; setup: boolean}>('owner/entry/start', {method:'POST',body:pin ? {pin} : {}});
export const verifyOwnerEntry = (body: {challengeId: string; otp: string; pin?: string; totp?: string}) => request<{grant: string; expiresIn: number}>('owner/entry/verify',{method:'POST',body});
export const setupOwnerPin = (body: {pin: string; totp: string}) => request<{grant: string; expiresIn: number}>('owner/pin/setup',{method:'POST',body});
export const entryOwnerTotp = (body: {pin: string; totp: string}) => request<{grant: string; expiresIn: number}>('owner/entry/totp',{method:'POST',body});
export const changeOwnerPin = (body: {currentPin: string; newPin: string; totp: string}) => request<{grant: string; expiresIn: number}>('owner/pin/change',{method:'POST',body});

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  const headers: Record<string, string> = {};
  if(ownerGrant) headers['X-Aegis-Owner-Grant']=ownerGrant;
  if (body !== undefined || !['GET', 'HEAD'].includes(method)) {
    headers['Content-Type'] = 'application/json';
  }

  const requestInit: RequestInit = {
    method,
    credentials: 'same-origin', // Transmits HttpOnly session cookie
    headers,
  };

  if (signal !== undefined) {
    requestInit.signal = signal;
  }

  if (body !== undefined) {
    requestInit.body = JSON.stringify(body);
  } else if (!['GET', 'HEAD'].includes(method)) {
    requestInit.body = '{}';
  }

  let response: Response;
  try {
    response = await fetch(`/api/${path}`, requestInit);
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error; // Propagate cancellation
    }
    throw new ApiNetworkError();
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  let data: unknown;
  if (isJson) {
    try {
      data = await response.json();
    } catch {
      throw new ApiParseError();
    }
  } else {
    // Non-JSON responses on error
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      throw new ApiRequestError(
        response.status,
        text.slice(0, 200) || `Request failed with status ${response.status}`,
      );
    }
    throw new ApiParseError('Expected JSON response from backend.');
  }

  if (!response.ok) {
    const errorData = data as { error?: string };
    const rawMessage = errorData?.error || `Request failed with status ${response.status}`;
    if(response.status===403 && rawMessage==='Owner access unavailable.') {
      ownerGrant=null;
      window.dispatchEvent(new Event('aegis-owner-locked'));
    }

    // Rate Limit (429) Retry-After parsing
    let retryAfter: number | undefined;
    const retryHeader = response.headers.get('Retry-After');
    if (retryHeader) {
      const parsed = parseInt(retryHeader, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        retryAfter = parsed;
      }
    }

    // Distinguish specific session errors
    if (response.status === 401) {
      if (rawMessage.toLowerCase().includes('session expired')) {
        throw new SessionExpiredError(rawMessage);
      }
      if (rawMessage.toLowerCase().includes('active account')) {
        throw new AccountSuspendedError(rawMessage);
      }
    }

    throw new ApiRequestError(response.status, rawMessage, retryAfter);
  }

  return data as T;
}

// ─── Config & Health ──────────────────────────────────────────────────────────

/** Check whether the backend is configured and if intake is enabled */
export async function getConfig(signal?: AbortSignal): Promise<ApiConfig> {
  const opts: RequestOptions = {};
  if (signal !== undefined) opts.signal = signal;
  return request<ApiConfig>('config', opts);
}

// ─── Authentication ───────────────────────────────────────────────────────────

/**
 * Fetch the current authenticated user.
 * - Returns user on 200.
 * - Returns null if not authenticated (401 with 'Sign in required.').
 * - Throws SessionExpiredError if 401 with 'Session expired.'.
 * - Throws AccountSuspendedError if 401 with 'Sign in with an active account.'.
 * - Throws ApiRequestError (403/503) or ApiNetworkError on backend outages.
 */
export async function getCurrentUser(signal?: AbortSignal): Promise<ApiUser | null> {
  const opts: RequestOptions = {};
  if (signal !== undefined) opts.signal = signal;
  try {
    const data = await request<{ user: ApiUser }>('me', opts);
    return data.user;
  } catch (error) {
    // Normal unauthenticated session: return null
    if (
      error instanceof ApiRequestError &&
      error.status === 401 &&
      !(error instanceof SessionExpiredError) &&
      !(error instanceof AccountSuspendedError)
    ) {
      return null;
    }
    // Propagate SessionExpiredError, AccountSuspendedError, NetworkError, 503, 403, etc.
    throw error;
  }
}

/**
 * Request a Google sign-in challenge nonce.
 */
export async function requestAuthChallenge(
  signal?: AbortSignal,
): Promise<{ nonce: string; clientId: string }> {
  const opts: RequestOptions = { method: 'POST', body: {} };
  if (signal !== undefined) opts.signal = signal;
  return request<{ nonce: string; clientId: string }>('auth/challenge', opts);
}

/**
 * Authenticate with backend using verified Google credential and active challenge nonce cookie.
 */
/**
 * Authenticate with backend using verified Google credential and active challenge nonce cookie.
 */
export async function loginWithGoogle(
  credential: string,
  signal?: AbortSignal,
): Promise<{ user: ApiUser }> {
  const opts: RequestOptions = { method: 'POST', body: { credential } };
  if (signal !== undefined) opts.signal = signal;
  return request<{ user: ApiUser }>('auth/google', opts);
}

/**
 * Authenticate with backend using institutional email and password.
 */
export async function loginWithPassword(
  payload: { email: string; password: string },
  signal?: AbortSignal,
): Promise<{ user: ApiUser }> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  return request<{ user: ApiUser }>('auth/login-password', opts);
}

/**
 * Register a new student account using institutional credentials.
 */
export async function registerStudent(
  payload: { email: string; password: string; name: string; department: string },
  signal?: AbortSignal,
): Promise<{ user: ApiUser }> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  return request<{ user: ApiUser }>('auth/register', opts);
}

/**
 * Request single-use password reset token.
 */
export async function requestPasswordReset(
  email: string,
  signal?: AbortSignal,
): Promise<{ message: string; resetToken?: string }> {
  const opts: RequestOptions = { method: 'POST', body: { email } };
  if (signal !== undefined) opts.signal = signal;
  return request<{ message: string; resetToken?: string }>('auth/password-reset/request', opts);
}

/**
 * Confirm password reset using valid token and new strong password.
 */
export async function confirmPasswordReset(
  payload: { token: string; newPassword: string },
  signal?: AbortSignal,
): Promise<{ ok: boolean; message: string }> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  return request<{ ok: boolean; message: string }>('auth/password-reset/confirm', opts);
}

/**
 * Authenticated linking of Google identity to active account session.
 */
export async function linkGoogleAccount(
  credential: string,
  signal?: AbortSignal,
): Promise<{ user: ApiUser; ok: boolean }> {
  const opts: RequestOptions = { method: 'POST', body: { credential } };
  if (signal !== undefined) opts.signal = signal;
  return request<{ user: ApiUser; ok: boolean }>('me/link-google', opts);
}

/**
 * Sign out the current user session server-side.
 * Rejects if server-side revocation fails or network is disconnected.
 */
export async function logout(signal?: AbortSignal): Promise<void> {
  const opts: RequestOptions = { method: 'POST', body: {} };
  if (signal !== undefined) opts.signal = signal;
  await request<{ ok: boolean }>('auth/logout', opts);
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface UpdateProfilePayload {
  department: string;
  staff_requested?: boolean | undefined;
}

export async function updateProfile(
  payload: UpdateProfilePayload,
  signal?: AbortSignal,
): Promise<ApiUser> {
  const opts: RequestOptions = { method: 'PATCH', body: payload };
  if (signal !== undefined) opts.signal = signal;
  const data = await request<{ user: ApiUser }>('me', opts);
  return data.user;
}

// ─── Complaints ───────────────────────────────────────────────────────────────

/** List complaints for current user */
export async function listComplaints(signal?: AbortSignal): Promise<ApiComplaint[]> {
  const opts: RequestOptions = {};
  if (signal !== undefined) opts.signal = signal;
  const data = await request<{ complaints: ApiComplaint[] }>('complaints', opts);
  return data.complaints;
}

/** Get a single complaint by ID */
export async function getComplaint(
  id: string,
  signal?: AbortSignal,
): Promise<{ complaint: ApiComplaint; reviews?: VerificationReview[] | undefined }> {
  const opts: RequestOptions = {};
  if (signal !== undefined) opts.signal = signal;
  return request<{ complaint: ApiComplaint; reviews?: VerificationReview[] | undefined }>(
    `complaints/${id}`,
    opts,
  );
}

/** Submit a new complaint (student only) */
export async function submitComplaint(
  payload: SubmitComplaintPayload,
  signal?: AbortSignal,
): Promise<ApiComplaint> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  const data = await request<{ complaint: ApiComplaint }>('complaints', opts);
  return data.complaint;
}

/** Update complaint status (authority action) */
export async function updateComplaintStatus(
  id: string,
  status: string,
  notes: string,
  signal?: AbortSignal,
): Promise<ApiComplaint> {
  const opts: RequestOptions = { method: 'PATCH', body: { status, notes } };
  if (signal !== undefined) opts.signal = signal;
  const data = await request<{ complaint: ApiComplaint }>(`complaints/${id}/status`, opts);
  return data.complaint;
}

/** Override routing tier for a complaint (authority action) */
export async function overrideComplaintRouting(
  id: string,
  targetTier: string,
  notes: string,
  signal?: AbortSignal,
): Promise<ApiComplaint> {
  const opts: RequestOptions = { method: 'PATCH', body: { targetTier, notes } };
  if (signal !== undefined) opts.signal = signal;
  const data = await request<{ complaint: ApiComplaint }>(`complaints/${id}/routing`, opts);
  return data.complaint;
}

/** Record human verification decision (authority action) */
export async function recordVerificationDecision(
  id: string,
  verification_status: string,
  notes: string,
  allegation_status?: string | undefined,
  signal?: AbortSignal,
): Promise<ApiComplaint> {
  const body: Record<string, string> = { verification_status, notes };
  if (allegation_status !== undefined) body['allegation_status'] = allegation_status;

  const opts: RequestOptions = { method: 'PATCH', body };
  if (signal !== undefined) opts.signal = signal;
  const data = await request<{ complaint: ApiComplaint }>(`complaints/${id}/verification`, opts);
  return data.complaint;
}

// ─── Private Evidence API Methods ──────────────────────────────────────────

export interface ApiEvidenceItem {
  id: string;
  status: string;
  createdAt: string;
  uploaderRole: string;
  isOwner: boolean;
}

export async function uploadComplaintEvidence(
  complaintId: string,
  payload: { fileName: string; mimeType: string; data: string },
  signal?: AbortSignal,
): Promise<{ evidence: { id: string; fileName: string; mimeType: string; sizeBytes: number; status: string; createdAt: string } }> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  return request<{ evidence: any }>(`complaints/${complaintId}/evidence`, opts);
}

export async function listComplaintEvidence(
  complaintId: string,
  signal?: AbortSignal,
): Promise<ApiEvidenceItem[]> {
  const opts: RequestOptions = {};
  if (signal !== undefined) opts.signal = signal;
  const res = await request<{ evidence: ApiEvidenceItem[] }>(`complaints/${complaintId}/evidence`, opts);
  return res.evidence;
}

export async function getEvidenceDownloadToken(
  complaintId: string,
  evidenceId: string,
  signal?: AbortSignal,
): Promise<{ token: string; expiresInSeconds: number }> {
  const opts: RequestOptions = { method: 'POST', body: {} };
  if (signal !== undefined) opts.signal = signal;
  return request<{ token: string; expiresInSeconds: number }>(`complaints/${complaintId}/evidence/${evidenceId}/token`, opts);
}

export async function listAdminUsers(signal?: AbortSignal): Promise<AdminUser[]> {
  const opts: RequestOptions = {};
  if (signal !== undefined) opts.signal = signal;
  const data = await request<{ users: AdminUser[] }>('admin/users', opts);
  return data.users;
}

export async function listAuditLogs(signal?: AbortSignal): Promise<AuditLog[]> {
  const opts: RequestOptions = {};
  if (signal !== undefined) opts.signal = signal;
  const data = await request<{ logs: AuditLog[] }>('admin/audit', opts);
  return data.logs;
}

export interface RoleAssignmentPayload {
  userId: string;
  role: string;
  department: string;
  department_code?: string | undefined;
  account_status: string;
  stepUpToken: string;
}

export async function assignRole(
  payload: RoleAssignmentPayload,
  signal?: AbortSignal,
): Promise<void> {
  const opts: RequestOptions = { method: 'PATCH', body: payload };
  if (signal !== undefined) opts.signal = signal;
  await request<{ ok: boolean }>('admin/roles', opts);
}

// ─── Stage 4.2: MFA & Step-Up Administration ──────────────────────────────────

export async function setupMfa(signal?: AbortSignal): Promise<import('./types').MfaSetupResponse> {
  const opts: RequestOptions = { method: 'POST', body: {} };
  if (signal !== undefined) opts.signal = signal;
  return request<import('./types').MfaSetupResponse>('admin/mfa/setup', opts);
}

export async function verifyMfa(
  payload: { code?: string; recoveryCode?: string },
  signal?: AbortSignal,
): Promise<import('./types').StepUpResponse> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  return request<import('./types').StepUpResponse>('admin/mfa/verify', opts);
}

export async function setupActionPin(pin: string, signal?: AbortSignal): Promise<void> {
  const opts: RequestOptions = { method: 'POST', body: { pin } };
  if (signal !== undefined) opts.signal = signal;
  await request<{ ok: boolean }>('admin/pin/setup', opts);
}

export async function verifyActionPin(
  pin: string,
  signal?: AbortSignal,
): Promise<import('./types').StepUpResponse> {
  const opts: RequestOptions = { method: 'POST', body: { pin } };
  if (signal !== undefined) opts.signal = signal;
  return request<import('./types').StepUpResponse>('admin/pin/verify', opts);
}

export async function performStepUp(
  payload: { code: string; pin: string },
  signal?: AbortSignal,
): Promise<import('./types').StepUpResponse> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  return request<import('./types').StepUpResponse>('admin/step-up', opts);
}

export async function updateAdminPermissions(
  payload: { userId: string; permissions: string[]; stepUpToken: string },
  signal?: AbortSignal,
): Promise<void> {
  const opts: RequestOptions = { method: 'PATCH', body: payload };
  if (signal !== undefined) opts.signal = signal;
  await request<{ ok: boolean }>('admin/permissions', opts);
}

export async function createAdminInvitation(
  payload: { email: string; permissions: string[]; stepUpToken: string },
  signal?: AbortSignal,
): Promise<import('./types').AdminInvitationResponse> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  return request<import('./types').AdminInvitationResponse>('admin/invitations', opts);
}

// ─── Stage 5.5A: Student Verification & Roster Client Methods ────────────────

export async function getStudentVerificationStatus(
  signal?: AbortSignal,
): Promise<import('./types').StudentVerificationStatusResponse> {
  const opts: RequestOptions = {};
  if (signal !== undefined) opts.signal = signal;
  return request<import('./types').StudentVerificationStatusResponse>('student/verification-status', opts);
}

export async function submitStudentVerificationRequest(
  payload: import('./types').StudentVerificationRequestPayload,
  signal?: AbortSignal,
): Promise<import('./types').StudentVerificationRequestResponse> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  return request<import('./types').StudentVerificationRequestResponse>('student/verification-request', opts);
}

export async function listAuthorityStudentRequests(
  signal?: AbortSignal,
): Promise<import('./types').AuthorityStudentRequestItem[]> {
  const opts: RequestOptions = {};
  if (signal !== undefined) opts.signal = signal;
  const data = await request<{ requests: import('./types').AuthorityStudentRequestItem[] }>('authority/students/requests', opts);
  return data.requests;
}

export async function reviewAuthorityStudentRequest(
  requestId: string,
  payload: import('./types').AuthorityStudentReviewPayload,
  signal?: AbortSignal,
): Promise<{ ok: boolean; decision: string }> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  return request<{ ok: boolean; decision: string }>(`authority/students/requests/${requestId}/review`, opts);
}

export async function listAdminDepartments(
  signal?: AbortSignal,
): Promise<import('./types').AdminDepartmentItem[]> {
  const opts: RequestOptions = {};
  if (signal !== undefined) opts.signal = signal;
  const data = await request<{ departments: import('./types').AdminDepartmentItem[] }>('admin/departments', opts);
  return data.departments;
}

export async function createAdminDepartment(
  payload: { code: string; name: string; stepUpToken: string },
  signal?: AbortSignal,
): Promise<import('./types').AdminDepartmentItem> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  const data = await request<{ department: import('./types').AdminDepartmentItem }>('admin/departments', opts);
  return data.department;
}

export async function listAdminAuthorities(
  signal?: AbortSignal,
): Promise<import('./types').AdminAuthorityAssignmentItem[]> {
  const opts: RequestOptions = {};
  if (signal !== undefined) opts.signal = signal;
  const data = await request<{ assignments: import('./types').AdminAuthorityAssignmentItem[] }>('admin/authorities', opts);
  return data.assignments;
}

export async function assignAdminAuthority(
  payload: { userId: string; departmentCode: string; role: string; stepUpToken: string },
  signal?: AbortSignal,
): Promise<void> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  await request<{ ok: boolean }>('admin/authorities/assign', opts);
}

export async function revokeAdminAuthority(
  payload: { userId: string; departmentCode?: string; role?: string; stepUpToken: string },
  signal?: AbortSignal,
): Promise<void> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  await request<{ ok: boolean }>('admin/authorities/revoke', opts);
}

export async function importRosterBatch(
  payload: { records: import('./types').RosterRecordInput[]; stepUpToken: string },
  signal?: AbortSignal,
): Promise<import('./types').RosterImportResponse> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  return request<import('./types').RosterImportResponse>('admin/roster/import', opts);
}

export async function listRosterConflicts(
  signal?: AbortSignal,
): Promise<import('./types').RosterConflictItem[]> {
  const opts: RequestOptions = {};
  if (signal !== undefined) opts.signal = signal;
  const data = await request<{ conflicts: import('./types').RosterConflictItem[] }>('admin/roster/conflicts', opts);
  return data.conflicts;
}

export async function resolveRosterConflict(
  conflictId: string,
  payload: { action: 'ACCEPTED_UPDATE' | 'DISCARDED'; notes?: string | undefined; stepUpToken: string },
  signal?: AbortSignal,
): Promise<{ ok: boolean; conflictId: string; status: string }> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  return request<{ ok: boolean; conflictId: string; status: string }>(`admin/roster/conflicts/${conflictId}/resolve`, opts);
}

// ─── G09.1: Hybrid Institutional Verification & Owner Governance ─────────────

export async function previewRosterBatch(
  payload: { records: import('./types').RosterRecordInput[]; version?: string; institutionCode?: string },
  signal?: AbortSignal,
): Promise<import('./types').RosterPreviewResponse> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  return request<import('./types').RosterPreviewResponse>('admin/roster/preview', opts);
}

export async function listOwnerInstitutions(
  signal?: AbortSignal,
): Promise<import('./types').InstitutionItem[]> {
  const opts: RequestOptions = {};
  if (signal !== undefined) opts.signal = signal;
  const data = await request<{ institutions: import('./types').InstitutionItem[] }>('owner/institutions', opts);
  return data.institutions;
}

export async function createOwnerInstitution(
  payload: import('./types').CreateInstitutionInput,
  signal?: AbortSignal,
): Promise<import('./types').InstitutionItem> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  const data = await request<{ institution: import('./types').InstitutionItem }>('owner/institutions', opts);
  return data.institution;
}

export async function updateOwnerInstitution(
  id: string,
  payload: import('./types').UpdateInstitutionInput,
  signal?: AbortSignal,
): Promise<import('./types').InstitutionItem> {
  const opts: RequestOptions = { method: 'PATCH', body: payload };
  if (signal !== undefined) opts.signal = signal;
  const data = await request<{ institution: import('./types').InstitutionItem }>(`owner/institutions/${id}`, opts);
  return data.institution;
}

export async function listOwnerVerificationClaims(
  params?: { status?: string; institutionId?: string; departmentCode?: string },
  signal?: AbortSignal,
): Promise<import('./types').VerificationClaimItem[]> {
  const opts: RequestOptions = {};
  if (signal !== undefined) opts.signal = signal;
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.institutionId) query.set('institutionId', params.institutionId);
  if (params?.departmentCode) query.set('departmentCode', params.departmentCode);
  const qs = query.toString();
  const url = qs ? `owner/verification-claims?${qs}` : 'owner/verification-claims';
  const data = await request<{ claims: import('./types').VerificationClaimItem[] }>(url, opts);
  return data.claims;
}

export async function reviewOwnerVerificationClaim(
  id: string,
  payload: { decision: 'APPROVED' | 'REJECTED'; notes: string; identityEvidenceReference?: string | undefined; stepUpToken: string },
  signal?: AbortSignal,
): Promise<{ ok: boolean; decision: string; id: string }> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  return request<{ ok: boolean; decision: string; id: string }>(`owner/verification-claims/${id}/review`, opts);
}

export async function revokeOwnerVerificationClaim(
  id: string,
  payload: { reason: string; stepUpToken: string },
  signal?: AbortSignal,
): Promise<{ ok: boolean; revoked: boolean; id: string }> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  return request<{ ok: boolean; revoked: boolean; id: string }>(`owner/verification-claims/${id}/revoke`, opts);
}

// ─── Local Student Services API Methods ─────────────────────────────────────

export async function fetchLocalServicesCatalog(
  institutionId?: string,
  signal?: AbortSignal,
): Promise<import('./types').StudentServiceCatalogItem[]> {
  const qs = institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : '';
  const opts: RequestOptions = {};
  if (signal !== undefined) opts.signal = signal;
  const res = await request<{ catalog: import('./types').StudentServiceCatalogItem[] }>(`local-services/catalog${qs}`, opts);
  return res.catalog;
}

export async function fetchLocalStudentRequests(
  signal?: AbortSignal,
): Promise<import('./types').StudentServiceRequestItem[]> {
  const opts: RequestOptions = {};
  if (signal !== undefined) opts.signal = signal;
  const res = await request<{ requests: import('./types').StudentServiceRequestItem[] }>('local-services/requests', opts);
  return res.requests;
}

export async function createLocalStudentRequest(
  payload: import('./types').CreateStudentServicePayload,
  signal?: AbortSignal,
): Promise<import('./types').StudentServiceRequestItem> {
  const opts: RequestOptions = { method: 'POST', body: payload };
  if (signal !== undefined) opts.signal = signal;
  const res = await request<{ request: import('./types').StudentServiceRequestItem }>('local-services/requests', opts);
  return res.request;
}

export async function fetchLocalServiceRequestDetails(
  id: string,
  signal?: AbortSignal,
): Promise<{ request: import('./types').StudentServiceRequestItem; auditLogs: import('./types').StudentServiceAuditLog[] }> {
  const opts: RequestOptions = {};
  if (signal !== undefined) opts.signal = signal;
  return request<{ request: import('./types').StudentServiceRequestItem; auditLogs: import('./types').StudentServiceAuditLog[] }>(
    `local-services/requests/${id}`,
    opts,
  );
}

export async function transitionLocalServiceRequest(
  id: string,
  payload: import('./types').TransitionStudentServicePayload,
  signal?: AbortSignal,
): Promise<import('./types').StudentServiceRequestItem> {
  const opts: RequestOptions = { method: 'PATCH', body: payload };
  if (signal !== undefined) opts.signal = signal;
  const res = await request<{ request: import('./types').StudentServiceRequestItem }>(
    `local-services/requests/${id}`,
    opts,
  );
  return res.request;
}

export async function fetchLocalStaffQueue(
  filters?: { state?: string | undefined; departmentCode?: string | undefined },
  signal?: AbortSignal,
): Promise<import('./types').StudentServiceRequestItem[]> {
  const query = new URLSearchParams();
  if (filters?.state) query.set('state', filters.state);
  if (filters?.departmentCode) query.set('departmentCode', filters.departmentCode);
  const qs = query.toString();
  const url = qs ? `local-services/staff/queue?${qs}` : 'local-services/staff/queue';
  const opts: RequestOptions = {};
  if (signal !== undefined) opts.signal = signal;
  const res = await request<{ queue: import('./types').StudentServiceRequestItem[] }>(url, opts);
  return res.queue;
}
