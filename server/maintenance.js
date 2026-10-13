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
 const targets = [
  ['sessions','expires_at','token_hash'],
  ['auth_challenges','expires_at','token_hash'],
  ['rate_limits','reset_at','bucket_hash'],
  ['password_reset_tokens','expires_at','id'],
  ['owner_entry_challenges','expires_at','id'],
  ['owner_portal_grants','expires_at','token_hash']
 ];
 for(const [table,column,key] of targets) {
  const result=await db.query(`WITH expired AS (SELECT ${key} FROM ${table} WHERE ${column}<=now() ORDER BY ${column} LIMIT 1000 FOR UPDATE SKIP LOCKED)
 DELETE FROM ${table} WHERE ${key} IN (SELECT ${key} FROM expired)`);
  counts[table]=result.rowCount;
 }
 return counts;
}
