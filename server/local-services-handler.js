/**
 * A.E.G.I.S — Local Student Services Handler Factory
 *
 * Dedicated isolated test-only execution path for local service APIs.
 * Invariants:
 * - Cannot be enabled via an ordinary production environment variable.
 * - Requires explicit dependency injection or isolated handler factory invocation.
 * - Uses real server-side authentication (sessionUser) and authorization.
 * - Exercises server/student-services.js domain methods.
 * - Distinct from live handler (which enforces 503 G11_STRICT_HOLD).
 */

import { sessionUser } from './auth.js';
import { database, transaction } from './db.js';
import { consumeRateLimit } from './rate-limit.js';
import { fail, fieldsOnly } from './policy.js';
import {
  listCatalog,
  createServiceRequest,
  transitionServiceRequest,
  listStudentRequests,
  listStaffQueue,
  getRequestDetails
} from './student-services.js';

export function createLocalServicesHandler(deps = {}) {
  const auth = deps.auth || { sessionUser };
  const store = deps.store || { database, transaction };
  const security = deps.security || { consumeRateLimit };

  return async function localServicesHandler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const send = (status, data) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    };

    try {
      const url = new URL(req.url, 'http://localhost');
      const path = '/api/' + (url.searchParams.get('route') || url.pathname.replace(/^\/api\/?/, '')).replace(/^\/|\/$/g, '');
      const method = req.method;

      // Extract JSON body helper
      const parseBody = async () => {
        if (req.body && typeof req.body === 'object') return req.body;
        return new Promise((resolve, reject) => {
          let str = '';
          req.on('data', chunk => {
            str += chunk;
            if (str.length > 1e6) {
              req.destroy();
              reject(Object.assign(new Error('Payload too large'), { status: 413 }));
            }
          });
          req.on('end', () => {
            if (!str) return resolve({});
            try {
              resolve(JSON.parse(str));
            } catch {
              reject(Object.assign(new Error('Invalid JSON payload'), { status: 400 }));
            }
          });
          req.on('error', reject);
        });
      };

      // Authenticate user via real sessionUser
      const user = await auth.sessionUser(req, store.database());
      if (!user) {
        fail(401, 'Authentication required.');
      }

      // ─── Route: /api/local-services/catalog ───
      if (path === '/api/local-services/catalog' && method === 'GET') {
        const institutionId = url.searchParams.get('institutionId') || user.institution_id;
        const catalog = await listCatalog(store.database(), user, institutionId);
        return send(200, { catalog });
      }

      // ─── Route: /api/local-services/requests (Student list / create) ───
      if (path === '/api/local-services/requests') {
        if (method === 'GET') {
          // List student's own requests
          const requests = await listStudentRequests(store.database(), user);
          return send(200, { requests });
        }
        if (method === 'POST') {
          const body = await parseBody();
          const request = await store.transaction(async client => {
            return await createServiceRequest(client, user, body);
          });
          return send(201, { request });
        }
      }

      // ─── Route: /api/local-services/requests/:id ───
      const singleMatch = path.match(/^\/api\/local-services\/requests\/([a-f0-9-]+)$/i);
      if (singleMatch) {
        const requestId = singleMatch[1];
        if (method === 'GET') {
          const details = await getRequestDetails(store.database(), user, requestId);
          return send(200, details);
        }
        if (method === 'PATCH' || method === 'POST') {
          const body = await parseBody();
          const updated = await store.transaction(async client => {
            return await transitionServiceRequest(client, user, requestId, body);
          });
          return send(200, { request: updated });
        }
      }

      // ─── Route: /api/local-services/staff/queue (Staff review queue) ───
      if (path === '/api/local-services/staff/queue' && method === 'GET') {
        const state = url.searchParams.get('state') || undefined;
        const departmentCode = url.searchParams.get('departmentCode') || undefined;
        const queue = await listStaffQueue(store.database(), user, { state, departmentCode });
        return send(200, { queue });
      }

      fail(404, 'Endpoint not found in local student services.');
    } catch (err) {
      const status = Number.isInteger(err?.status) ? err.status : 500;
      return send(status, { error: err.message || 'Internal server error', status });
    }
  };
}
