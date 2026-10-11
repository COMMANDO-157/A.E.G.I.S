import {createHash,timingSafeEqual} from 'node:crypto';
import {fail} from './policy.js';
export function authorizeMaintenance(req,secret=process.env.CRON_SECRET) {
 if(typeof secret!=='string'||secret.length<32) fail(503,'Maintenance is not configured.');
 const hash=value=>createHash('sha256').update(value).digest();
 const expectedHash=hash(secret);

 // 1. Support x-cron-secret header
 const xSecret=req.headers['x-cron-secret'];
 if(typeof xSecret==='string' && xSecret.length > 0) {
  if(timingSafeEqual(hash(xSecret), expectedHash)) return;
  fail(401,'Maintenance authorization required.');
 }

 // 2. Support Authorization: Bearer <secret>
 const authHeader=String(req.headers.authorization||'');
 if(authHeader.startsWith('Bearer ')) {
  const token=authHeader.slice(7);
  if(timingSafeEqual(hash(token), expectedHash)) return;
 }

 fail(401,'Maintenance authorization required.');
}
export async function cleanupExpired(db) {
 const counts={};
 for(const [table,column] of [['sessions','expires_at'],['auth_challenges','expires_at'],['rate_limits','reset_at']]) {
  const key=table==='rate_limits'?'bucket_hash':'token_hash';
  const result=await db.query(`WITH expired AS (SELECT ${key} FROM ${table} WHERE ${column}<=now() ORDER BY ${column} LIMIT 1000 FOR UPDATE SKIP LOCKED)
 DELETE FROM ${table} WHERE ${key} IN (SELECT ${key} FROM expired)`);
  counts[table]=result.rowCount;
 }
 return counts;
}
