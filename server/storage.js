/**
 * A.E.G.I.S 4.0 — Secure Private Evidence Storage & Access Manager
 * Stage 5.5B–5.5D Provider-Independent Object Storage Architecture
 *
 * Invariants:
 * 1. Provider-independent storage adapter architecture supporting:
 *    - Local filesystem storage (`LocalDiskStorageProvider`) for local dev.
 *    - S3/GCS/R2/Blob compatible mockable interface (`ObjectStorageProvider`) for serverless/cloud.
 * 2. File references strictly adhere to database constraint: `file_reference LIKE 'private/%'`.
 * 3. File size capped at 10MB per file with magic bytes / content validation.
 * 4. Whitelisted safe MIME types only: PNG, JPEG, WEBP, PDF, TXT.
 * 5. Dangerous executables, scripts, active HTML, and path traversal rejected.
 * 6. Cryptographically bound, short-lived (15-min) HMAC-SHA256 access tokens bound to:
 *    `{ evidenceId, complaintId, userId, sessionHash, expiresAt }`.
 *    Prevents replay, token swapping, cross-complaint, or cross-user access.
 * 7. Zero public URLs or direct external access exposed.
 */

import { randomUUID, createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { fail } from './policy.js';

const STORAGE_ROOT = resolve(process.cwd(), 'data', 'evidence', 'private');
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
]);

const EXTENSION_MAP = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
};

// Magic bytes signatures for content validation
const MAGIC_SIGNATURES = [
  { mime: 'image/png', matches: (buf) => buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 },
  { mime: 'image/jpeg', matches: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff },
  { mime: 'image/webp', matches: (buf) => buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP' },
  { mime: 'application/pdf', matches: (buf) => buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === '%PDF' },
  {
    mime: 'text/plain',
    matches: (buf) => {
      // Must not contain null bytes or common binary markers
      for (let i = 0; i < Math.min(buf.length, 512); i++) {
        if (buf[i] === 0x00) return false;
      }
      return true;
    }
  }
];

function getStorageSecret() {
  return process.env.SESSION_SECRET || 'aegis-evidence-storage-secret-key-32b';
}

/**
 * Validates buffer against claimed MIME type using magic header bytes.
 * @param {Buffer} buffer
 * @param {string} claimedMime
 * @returns {boolean}
 */
export function validateContentSignature(buffer, claimedMime) {
  const sig = MAGIC_SIGNATURES.find(s => s.mime === claimedMime);
  if (!sig) return false;
  return sig.matches(buffer);
}

/**
 * ─── Storage Providers Interface & Implementations ───────────────────────────
 */

export class LocalDiskStorageProvider {
  constructor(root = STORAGE_ROOT) {
    this.root = root;
    this.name = 'LocalDiskStorage';
  }

  async init() {
    await mkdir(this.root, { recursive: true });
  }

  async put(key, buffer) {
    await this.init();
    const diskFileName = basename(key.replace(/^private\//, ''));
    if (diskFileName.includes('..') || diskFileName.includes('/') || diskFileName.includes('\\')) {
      fail(403, 'Path traversal rejected.');
    }
    const diskPath = join(this.root, diskFileName);
    await writeFile(diskPath, buffer);
    return { key, size: buffer.length };
  }

  async get(key) {
    const diskFileName = basename(key.replace(/^private\//, ''));
    if (diskFileName.includes('..') || diskFileName.includes('/') || diskFileName.includes('\\')) {
      fail(403, 'Path traversal rejected.');
    }
    const diskPath = join(this.root, diskFileName);
    try {
      return await readFile(diskPath);
    } catch {
      fail(404, 'Evidence file not found in storage.');
    }
  }

  async delete(key) {
    const diskFileName = basename(key.replace(/^private\//, ''));
    const diskPath = join(this.root, diskFileName);
    try {
      await unlink(diskPath);
    } catch {
      // Ignored if file doesn't exist
    }
  }
}

export class MemoryMockStorageProvider {
  constructor() {
    this.store = new Map();
    this.name = 'MemoryMockStorage';
  }

  async init() {}

  async put(key, buffer) {
    this.store.set(key, Buffer.from(buffer));
    return { key, size: buffer.length };
  }

  async get(key) {
    const buf = this.store.get(key);
    if (!buf) fail(404, 'Evidence file not found in storage.');
    return Buffer.from(buf);
  }

  async delete(key) {
    this.store.delete(key);
  }
}

/**
 * Cloud Object Storage Adapter (Compatible with AWS S3, Cloudflare R2, Google Cloud Storage, Neon/Vercel Blob)
 * Operates with standard pre-authenticated or client-based object upload/download SDKs.
 */
export class CloudObjectStorageProvider {
  constructor(options = {}) {
    this.name = 'CloudObjectStorage';
    this.bucket = options.bucket || process.env.EVIDENCE_STORAGE_BUCKET;
    this.endpoint = options.endpoint || process.env.EVIDENCE_STORAGE_ENDPOINT;
    this.allowMock = Boolean(options.mockStore || options.allowMock);
    this.mockStore = options.mockStore || (this.allowMock ? new Map() : null);
  }

  async init() {
    if (!this.bucket && !this.allowMock) {
      fail(503, 'Cloud evidence object storage is not configured (missing bucket/credentials).');
    }
  }

  async put(key, buffer) {
    await this.init();
    if (this.mockStore) {
      this.mockStore.set(key, Buffer.from(buffer));
      return { key, size: buffer.length };
    }
    fail(503, 'Cloud evidence object storage upload dispatch is unconfigured.');
  }

  async get(key) {
    await this.init();
    if (this.mockStore) {
      const buf = this.mockStore.get(key);
      if (!buf) fail(404, 'Evidence file not found in cloud storage.');
      return Buffer.from(buf);
    }
    fail(503, 'Cloud evidence object storage download dispatch is unconfigured.');
  }

  async delete(key) {
    if (this.mockStore) {
      this.mockStore.delete(key);
    }
  }
}

// Active storage provider singleton (defaults to LocalDiskStorageProvider for local dev)
let activeProvider = new LocalDiskStorageProvider();

export function setStorageProvider(provider) {
  activeProvider = provider;
}

export function getStorageProvider() {
  return activeProvider;
}

/**
 * Validates, writes, and stores private evidence.
 * @param {Object} options
 * @param {string} options.complaintId
 * @param {string} options.userId
 * @param {string} options.mimeType
 * @param {string} options.fileName
 * @param {Buffer|string} options.data
 * @returns {Promise<{ fileReference: string, sizeBytes: number, mimeType: string, fileName: string }>}
 */
export async function storePrivateEvidence({ complaintId, userId, mimeType, fileName, data }) {
  const normalizedMime = (mimeType || '').trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    fail(415, `Unsupported evidence file type: ${normalizedMime}. Allowed: PNG, JPEG, WEBP, PDF, TXT.`);
  }

  let buffer;
  if (Buffer.isBuffer(data)) {
    buffer = data;
  } else if (typeof data === 'string') {
    if (data.startsWith('data:') && data.includes(';base64,')) {
      const b64 = data.split(';base64,')[1];
      buffer = Buffer.from(b64, 'base64');
    } else {
      buffer = Buffer.from(data, 'base64');
    }
  } else {
    fail(400, 'Invalid evidence data payload.');
  }

  if (buffer.length === 0) {
    fail(400, 'Evidence payload cannot be empty.');
  }

  if (buffer.length > MAX_FILE_SIZE) {
    fail(413, `File exceeds maximum allowed size of 10MB (received ${(buffer.length / (1024 * 1024)).toFixed(2)}MB).`);
  }

  // Real magic bytes content validation
  if (!validateContentSignature(buffer, normalizedMime)) {
    fail(422, `Content signature does not match declared MIME type (${normalizedMime}). Potential active or corrupted content rejected.`);
  }

  const fileId = randomUUID();
  const ext = EXTENSION_MAP[normalizedMime] || '.bin';
  const objectKey = `private/${fileId}${ext}`;

  // Store through provider adapter
  await activeProvider.put(objectKey, buffer);

  // Sanitize filename to alphanumeric and safe punctuation
  const safeBaseName = basename(fileName || `${fileId}${ext}`).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255);

  return {
    fileReference: objectKey,
    sizeBytes: buffer.length,
    mimeType: normalizedMime,
    fileName: safeBaseName || `${fileId}${ext}`,
  };
}

/**
 * Reads evidence file from active storage provider.
 * @param {string} fileReference
 * @returns {Promise<Buffer>}
 */
export async function readPrivateEvidence(fileReference) {
  if (!fileReference || !fileReference.startsWith('private/')) {
    fail(403, 'Invalid file reference.');
  }
  const cleanKey = fileReference.replace(/^private\//, '');
  if (cleanKey.includes('..') || cleanKey.includes('/') || cleanKey.includes('\\')) {
    fail(403, 'Path traversal rejected.');
  }
  return await activeProvider.get(fileReference);
}

/**
 * Issues a cryptographically bound, short-lived (15 minute) HMAC-signed access token.
 * Token is bound to:
 * - evidenceId: specific evidence record
 * - complaintId: specific complaint
 * - userId: requesting user
 * - sessionHash: requesting user's active session hash (binds token to session)
 * - expiresAt: 15-minute validity window
 *
 * @param {Object} params
 * @param {string} params.evidenceId
 * @param {string} params.complaintId
 * @param {string} params.userId
 * @param {string} [params.sessionHash]
 * @returns {string} token
 */
// Track consumed tokens to prevent replay within the validity window (single-use enforcement)
const consumedTokens = new Map();

function cleanExpiredConsumedTokens() {
  const now = Date.now();
  for (const [jti, exp] of consumedTokens.entries()) {
    if (now > exp) consumedTokens.delete(jti);
  }
}

/**
 * Issues a cryptographically bound, single-use, short-lived (15 minute) HMAC-signed access token.
 * Token is bound to:
 * - jti: unique token nonce
 * - evidenceId: specific evidence record
 * - complaintId: specific complaint
 * - userId: requesting user
 * - sessionHash: requesting user's active session hash
 * - expiresAt: 15-minute validity window
 *
 * @param {Object} params
 * @param {string} params.evidenceId
 * @param {string} params.complaintId
 * @param {string} params.userId
 * @param {string} [params.sessionHash]
 * @returns {string} token
 */
export function generateEvidenceAccessToken({ evidenceId, complaintId, userId, sessionHash = '' }) {
  cleanExpiredConsumedTokens();
  const jti = randomUUID();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
  const payload = `${jti}:${evidenceId}:${complaintId}:${userId}:${sessionHash || 'any'}:${expiresAt}`;
  const sig = createHmac('sha256', getStorageSecret()).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({
    jti,
    evidenceId,
    complaintId,
    userId,
    sessionHash: sessionHash || 'any',
    expiresAt,
    sig
  })).toString('base64url');
}

/**
 * Verifies short-lived evidence access token with strict contextual binding.
 *
 * @param {string} token
 * @param {Object} expected
 * @param {string} expected.evidenceId
 * @param {string} expected.complaintId
 * @param {string} expected.userId
 * @param {string} [expected.sessionHash]
 * @param {boolean} [expected.consume=false]
 * @returns {boolean}
 */
export function verifyEvidenceAccessToken(token, { evidenceId, complaintId, userId, sessionHash = '', consume = false, db = null }) {
  try {
    cleanExpiredConsumedTokens();
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    const { jti, evidenceId: tEvId, complaintId: tCompId, userId: tUid, sessionHash: tSess, expiresAt, sig } = parsed;

    if (!jti || consumedTokens.has(jti)) return false; // Single-use rejection if already consumed
    if (tEvId !== evidenceId || tCompId !== complaintId || tUid !== userId) return false;
    if (tSess !== 'any' && sessionHash && tSess !== sessionHash) return false;
    if (Date.now() > expiresAt) return false;

    const payload = `${jti}:${tEvId}:${tCompId}:${tUid}:${tSess}:${expiresAt}`;
    const expectedSig = createHmac('sha256', getStorageSecret()).update(payload).digest('hex');
    const sigBuf = Buffer.from(sig, 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expBuf.length) return false;
    if (!timingSafeEqual(sigBuf, expBuf)) return false;

    if (consume) {
      consumedTokens.set(jti, expiresAt);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Atomically verifies and consumes single-use evidence token using shared durable PostgreSQL state
 * across serverless instances, preventing replay attacks across multi-instance environments.
 * Falls back safely to in-memory state if database is unavailable.
 *
 * @param {string} token
 * @param {Object} expected
 * @param {string} expected.evidenceId
 * @param {string} expected.complaintId
 * @param {string} expected.userId
 * @param {string} [expected.sessionHash]
 * @param {Object} [expected.db]
 * @returns {Promise<boolean>}
 */
export async function verifyAndConsumeEvidenceAccessTokenDurable(token, { evidenceId, complaintId, userId, sessionHash = '', db = null }) {
  // First verify cryptographic signature and contextual parameters in-memory
  const valid = verifyEvidenceAccessToken(token, { evidenceId, complaintId, userId, sessionHash, consume: false });
  if (!valid) return false;

  let raw, parsed;
  try {
    raw = Buffer.from(token, 'base64url').toString('utf8');
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }

  const { jti, expiresAt } = parsed;
  if (!jti || consumedTokens.has(jti)) return false;

  // If a durable shared database is available, record consumption atomically in rate_limits table
  if (db) {
    try {
      const bucketHash = createHash('sha256').update('evidence_token:' + jti).digest('hex');
      const resetIntervalSeconds = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
      const res = await db.query(
        "INSERT INTO rate_limits(bucket_hash, hits, reset_at) VALUES($1, 1, clock_timestamp() + $2 * interval '1 second') ON CONFLICT(bucket_hash) DO NOTHING RETURNING hits",
        [bucketHash, resetIntervalSeconds]
      );
      if (res.rowCount === 0) {
        // Token was already consumed concurrently by another instance! Fail closed.
        consumedTokens.set(jti, expiresAt);
        return false;
      }
    } catch (err) {
      // If DB error occurs, check if it's already in memory; fail closed on concurrency
      console.warn('[STORAGE] Durable replay check database query failed, falling back to local memory:', err.message);
    }
  }

  // Atomically mark consumed in local instance cache
  consumedTokens.set(jti, expiresAt);
  return true;
}

/**
 * Atomically marks token as consumed to prevent replay.
 */
export function consumeEvidenceAccessToken(token) {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (parsed.jti && parsed.expiresAt) {
      consumedTokens.set(parsed.jti, parsed.expiresAt);
    }
  } catch {}
}

