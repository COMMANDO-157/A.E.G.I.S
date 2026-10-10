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

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) {
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

// ─── Admin ────────────────────────────────────────────────────────────────────

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
  account_status: string;
}

export async function assignRole(
  payload: RoleAssignmentPayload,
  signal?: AbortSignal,
): Promise<void> {
  const opts: RequestOptions = { method: 'PATCH', body: payload };
  if (signal !== undefined) opts.signal = signal;
  await request<{ ok: boolean }>('admin/roles', opts);
}
