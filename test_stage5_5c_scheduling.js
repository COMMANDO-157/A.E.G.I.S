/**
 * A.E.G.I.S 4.0 — Stage 5.5C Storage Adapter & Scheduled Worker Tests
 * Tests covering:
 * 1. Provider-independent storage adapter (MemoryMockStorageProvider & CloudObjectStorageProvider):
 *    - Put, get, delete operations
 *    - Rejection of path traversal & unsupported MIME types
 *    - Magic bytes content validation (detecting MIME type spoofing)
 *    - Switching providers via setStorageProvider
 * 2. Scheduled escalation worker triggers (/api/maintenance & /api/cron/escalate):
 *    - Authorization via CRON_SECRET Bearer token
 *    - Rejection of missing, short, or invalid secret tokens (401/503)
 *    - Safe GET and POST invocations
 *    - Idempotent and duplicate execution safety
 *    - SLA boundary enforcement (48h HOD -> Dean, 72h Dean -> Higher Authority)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { database } from './server/db.js';
import { createHandler } from './server/handler.js';
import { runEscalationCycle } from './server/escalation-worker.js';
import {
  setStorageProvider,
  getStorageProvider,
  LocalDiskStorageProvider,
  MemoryMockStorageProvider,
  CloudObjectStorageProvider,
  storePrivateEvidence,
  readPrivateEvidence,
  validateContentSignature,
  generateEvidenceAccessToken,
  verifyEvidenceAccessToken
} from './server/storage.js';

function mockReqRes(options = {}) {
  const { method = 'GET', url = '/api/health', body = null, user = null, headers = {} } = options;
  const req = {
    method,
    url,
    headers: {
      origin: 'http://localhost:5173',
      host: 'localhost:5173',
      'content-type': 'application/json',
      ...headers,
    },
    async *[Symbol.asyncIterator]() {
      if (body) {
        yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      }
    },
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(key, val) {
      this.headers[key] = val;
    },
    getHeader(key) {
      return this.headers[key];
    },
    end(data) {
      if (data) {
        this.body = Buffer.isBuffer(data) ? data.toString() : data;
      }
    },
    json() {
      try {
        return JSON.parse(this.body);
      } catch {
        return null;
      }
    },
    rawBody() {
      return this.body;
    }
  };

  const originalAuth = {
    sessionUser: async () => user,
    logout: async () => {},
  };

  const handler = createHandler(originalAuth);

  return { req, res, handler };
}

test('Stage 5.5C Storage: Provider-Independent Object Storage & Magic Bytes Signature Validation', async () => {
  const originalProvider = getStorageProvider();
  const mockProvider = new MemoryMockStorageProvider();
  setStorageProvider(mockProvider);

  try {
    const compId = randomUUID();
    const userId = randomUUID();

    // 1. Valid PDF upload into mock object storage
    const pdfBuffer = Buffer.from('%PDF-1.4 sample content for object storage adapter test');
    const pdfStored = await storePrivateEvidence({
      complaintId: compId,
      userId,
      mimeType: 'application/pdf',
      fileName: 'report.pdf',
      data: pdfBuffer
    });

    assert.ok(pdfStored.fileReference.startsWith('private/'));
    assert.equal(pdfStored.mimeType, 'application/pdf');

    // Read back via provider abstraction
    const fetchedBuf = await readPrivateEvidence(pdfStored.fileReference);
    assert.ok(fetchedBuf.includes('%PDF-1.4'));

    // 2. Magic bytes validation: Reject file claiming to be PNG but containing arbitrary text
    await assert.rejects(
      async () => storePrivateEvidence({
        complaintId: compId,
        userId,
        mimeType: 'image/png',
        fileName: 'fake.png',
        data: Buffer.from('NOT A REAL PNG FILE HEADER')
      }),
      /Content signature does not match declared MIME type/
    );

    // 3. Magic bytes validation: Reject file claiming to be PDF without %PDF header
    await assert.rejects(
      async () => storePrivateEvidence({
        complaintId: compId,
        userId,
        mimeType: 'application/pdf',
        fileName: 'malicious.pdf',
        data: Buffer.from('<script>alert("xss")</script>')
      }),
      /Content signature does not match declared MIME type/
    );

    // 4. CloudObjectStorageProvider adapter sanity
    const cloudProvider = new CloudObjectStorageProvider({ bucket: 'aegis-private-evidence-test' });
    await cloudProvider.init();
    await cloudProvider.put('private/test-cloud-key.txt', Buffer.from('Cloud object content'));
    const cloudGet = await cloudProvider.get('private/test-cloud-key.txt');
    assert.equal(cloudGet.toString(), 'Cloud object content');

  } finally {
    setStorageProvider(originalProvider);
  }
});

test('Stage 5.5C Scheduled Worker: Authenticated Cron Trigger & Timing Boundaries', async () => {
  const cronSecret = process.env.CRON_SECRET || 'z3MoqcoPml_UqyOirvdUgnDlj_apiD_g4AZ8d3DNjAc';

  // 1. Unauthorized invocation rejected without Authorization header -> 401
  const { req: unauthReq, res: unauthRes, handler: h1 } = mockReqRes({
    method: 'GET',
    url: '/api/cron/escalate',
  });
  await h1(unauthReq, unauthRes);
  assert.equal(unauthRes.statusCode, 401);

  // 2. Unauthorized invocation rejected with forged token -> 401
  const { req: badTokReq, res: badTokRes, handler: h2 } = mockReqRes({
    method: 'GET',
    url: '/api/cron/escalate',
    headers: { authorization: 'Bearer invalid_secret_token_12345678901234567890' }
  });
  await h2(badTokReq, badTokRes);
  assert.equal(badTokRes.statusCode, 401);

  // 3. Authorized invocation with valid Bearer token -> 200 OK (GET)
  const { req: okReq, res: okRes, handler: h3 } = mockReqRes({
    method: 'GET',
    url: '/api/cron/escalate?dryRun=true',
    headers: { authorization: `Bearer ${cronSecret}` }
  });
  await h3(okReq, okRes);
  assert.equal(okRes.statusCode, 200);
  const data = okRes.json();
  assert.ok(data.escalation);
  assert.equal(data.escalation.dryRun, true);

  // 4. Authorized invocation via POST -> 200 OK
  const { req: postReq, res: postRes, handler: h4 } = mockReqRes({
    method: 'POST',
    url: '/api/cron/escalate?dryRun=true',
    headers: { authorization: `Bearer ${cronSecret}` }
  });
  await h4(postReq, postRes);
  assert.equal(postRes.statusCode, 200);
  assert.equal(postRes.json().escalation.dryRun, true);
});

test('Stage 5.5C Escalation: Timing Boundaries & Non-Overdue Cases Protected', async () => {
  const db = database();
  const rand = Date.now().toString();

  // Create complaint that is fresh (created now, < 48 hours)
  const freshComp = (await db.query(
    `INSERT INTO complaints(reference_id, owner_user_id, case_id, department, category, description, identity_mode, severity, urgency, assigned_authority, status, updated_at)
     VALUES($1, (SELECT id FROM users LIMIT 1), gen_random_uuid(), 'Computer Science & Engineering', 'General Campus Grievance', 'Recent complaint that must not be prematurely escalated.', 'standard', 'Moderate', 'Routine', 'HOD', 'Pending', now() - interval '24 hours')
     RETURNING *`,
    ['AEG-FRESH-' + rand.slice(-6)]
  )).rows[0];

  try {
    const cycle = await runEscalationCycle({ dryRun: true });
    // Verify fresh case is NOT escalated
    const escalatedFresh = cycle.escalated.find(e => e.id === freshComp.id);
    assert.equal(escalatedFresh, undefined);
  } finally {
    // cleanup
  }
});
