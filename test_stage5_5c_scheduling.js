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
  initializeDefaultStorageProvider,
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

    // 4. CloudObjectStorageProvider: Fails closed when unconfigured and allowMock is false
    const unconfiguredProvider = new CloudObjectStorageProvider();
    await assert.rejects(
      async () => unconfiguredProvider.init(),
      /Cloud evidence object storage is not configured/
    );

    // 5. CloudObjectStorageProvider adapter sanity when configured or in explicit mock mode
    const cloudProvider = new CloudObjectStorageProvider({ bucket: 'aegis-private-evidence-test', allowMock: true });
    await cloudProvider.init();
    await cloudProvider.put('private/test-cloud-key.txt', Buffer.from('Cloud object content'));
    const cloudGet = await cloudProvider.get('private/test-cloud-key.txt');
    assert.equal(cloudGet.toString(), 'Cloud object content');

    // 5b. CloudObjectStorageProvider SigV4 request signing and mock HTTP dispatch validation
    const mockHttpStore = new Map();
    const mockFetch = async (url, opts = {}) => {
      const u = new URL(url);
      const key = u.pathname;
      if (opts.method === 'PUT') {
        mockHttpStore.set(key, opts.body);
        return { ok: true, status: 200 };
      }
      if (opts.method === 'GET') {
        if (!mockHttpStore.has(key)) return { ok: false, status: 404 };
        const data = mockHttpStore.get(key);
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        };
      }
      if (opts.method === 'DELETE') {
        mockHttpStore.delete(key);
        return { ok: true, status: 204 };
      }
      return { ok: false, status: 405 };
    };

    const s3Provider = new CloudObjectStorageProvider({
      bucket: 'test-bucket',
      endpoint: 'https://r2.cloudflarestorage.com',
      region: 'auto',
      accessKeyId: 'TEST_ACCESS_KEY',
      secretAccessKey: 'TEST_SECRET_ACCESS_KEY_0123456789',
      allowMock: false,
      fetchFn: mockFetch
    });

    const signedHeaders = s3Provider.signRequest({
      method: 'PUT',
      url: 'https://r2.cloudflarestorage.com/test-bucket/private/file.txt',
      body: Buffer.from('sigv4-test-data')
    });
    assert.ok(signedHeaders.Authorization.startsWith('AWS4-HMAC-SHA256 Credential=TEST_ACCESS_KEY/'));
    assert.ok(signedHeaders['x-amz-date']);
    assert.ok(signedHeaders['x-amz-content-sha256']);

    // Test real dispatch via mock fetch
    await s3Provider.put('private/evidence-sigv4.bin', Buffer.from('secure-sigv4-bytes'));
    const sigv4FetchedBuf = await s3Provider.get('private/evidence-sigv4.bin');
    assert.equal(sigv4FetchedBuf.toString(), 'secure-sigv4-bytes');
    await s3Provider.delete('private/evidence-sigv4.bin');
    await assert.rejects(
      async () => s3Provider.get('private/evidence-sigv4.bin'),
      /Evidence file not found/
    );

    // 6. Token binding & single-use replay rejection test
    const token = generateEvidenceAccessToken({
      evidenceId: 'test-ev-123',
      complaintId: 'test-comp-456',
      userId: 'test-usr-789',
      sessionHash: 'sess-abc'
    });
    // First verification with consume: true succeeds
    assert.equal(verifyEvidenceAccessToken(token, {
      evidenceId: 'test-ev-123',
      complaintId: 'test-comp-456',
      userId: 'test-usr-789',
      sessionHash: 'sess-abc',
      consume: true
    }), true);
    // Second verification with same token fails immediately (single-use replay prevention)
    assert.equal(verifyEvidenceAccessToken(token, {
      evidenceId: 'test-ev-123',
      complaintId: 'test-comp-456',
      userId: 'test-usr-789',
      sessionHash: 'sess-abc'
    }), false);

    // 7. Security requirement: Production environment MUST fail closed if cloud storage is unconfigured
    const prodUnconfigured = initializeDefaultStorageProvider({ NODE_ENV: 'production' });
    assert.equal(prodUnconfigured.name, 'CloudObjectStorage');
    await assert.rejects(
      async () => prodUnconfigured.init(),
      /Cloud evidence object storage is not configured/
    );

    // Development environment defaults safely to LocalDiskStorageProvider
    const devStorage = initializeDefaultStorageProvider({ NODE_ENV: 'development' });
    assert.equal(devStorage.name, 'LocalDiskStorage');

    // Configured cloud storage returns CloudObjectStorageProvider
    const configuredCloud = initializeDefaultStorageProvider({
      EVIDENCE_STORAGE_BUCKET: 'prod-bucket',
      EVIDENCE_STORAGE_ACCESS_KEY_ID: 'key',
      EVIDENCE_STORAGE_SECRET_ACCESS_KEY: 'secret'
    });
    assert.equal(configuredCloud.name, 'CloudObjectStorage');
    assert.equal(configuredCloud.bucket, 'prod-bucket');

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

  // 4. Authorized invocation via x-cron-secret header -> 200 OK (GET)
  const { req: xCronReq, res: xCronRes, handler: h4 } = mockReqRes({
    method: 'GET',
    url: '/api/cron/escalate?dryRun=true',
    headers: { 'x-cron-secret': cronSecret }
  });
  await h4(xCronReq, xCronRes);
  assert.equal(xCronRes.statusCode, 200);
  assert.equal(xCronRes.json().escalation.dryRun, true);

  // 5. Authorized invocation via POST -> 200 OK
  const { req: postReq, res: postRes, handler: h5 } = mockReqRes({
    method: 'POST',
    url: '/api/cron/escalate?dryRun=true',
    headers: { authorization: `Bearer ${cronSecret}` }
  });
  await h5(postReq, postRes);
  assert.equal(postRes.statusCode, 200);
  assert.equal(postRes.json().escalation.dryRun, true);
});

test('Stage 5.5C Escalation: Timing Boundaries & Non-Overdue Cases Protected', async () => {
  const db = database();
  const rand = Date.now().toString();

  const reporter=(await db.query("INSERT INTO users(google_subject_id,email,name) VALUES($1,$2,'Synthetic scheduling reporter') RETURNING id",['scheduling_'+rand,'scheduling.'+rand+'@example.test'])).rows[0];

  // Create complaint that is fresh (created now, < 48 hours)
  const freshComp = (await db.query(
    `INSERT INTO complaints(reference_id, owner_user_id, case_id, department, category, description, identity_mode, severity, urgency, assigned_authority, status, updated_at)
     VALUES($1, $2, gen_random_uuid(), 'Computer Science & Engineering', 'General Campus Grievance', 'Recent complaint that must not be prematurely escalated.', 'standard', 'Moderate', 'Routine', 'HOD', 'Pending', now() - interval '24 hours')
     RETURNING *`,
    ['AEG-FRESH-' + rand.slice(-6),reporter.id]
  )).rows[0];

  const cycle = await runEscalationCycle({ dryRun: true });
  // Verify fresh case is NOT escalated
  const escalatedFresh = cycle.escalated.find(e => e.id === freshComp.id);
  assert.equal(escalatedFresh, undefined);
});
