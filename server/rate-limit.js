import {createHash} from 'node:crypto';
import {fail} from './policy.js';
export async function consumeRateLimit(db,bucket,limit,seconds=60) {
 if(!Number.isInteger(limit)||limit<1||!Number.isInteger(seconds)||seconds<1) throw new Error('Invalid rate policy.');
 const hash=createHash('sha256').update(bucket).digest('hex');
 const result=await db.query(`INSERT INTO rate_limits(bucket_hash,hits,reset_at)
 VALUES($1,1,clock_timestamp()+$3*interval '1 second')
 ON CONFLICT(bucket_hash) DO UPDATE SET
 hits=CASE WHEN rate_limits.reset_at<=clock_timestamp() THEN 1 ELSE LEAST(rate_limits.hits+1,$2+1) END,
 reset_at=CASE WHEN rate_limits.reset_at<=clock_timestamp() THEN clock_timestamp()+$3*interval '1 second' ELSE rate_limits.reset_at END
 RETURNING hits,GREATEST(1,CEIL(EXTRACT(EPOCH FROM reset_at-clock_timestamp()))) AS retry_after`,[hash,limit,seconds]);
 const row=result.rows[0];
 if(!row||!Number.isInteger(Number(row.hits))||Number(row.hits)<1) fail(503,'Rate protection unavailable.');
 if(row.hits>limit) throw Object.assign(new Error('Too many requests. Please try again later.'),{status:429,retryAfter:Number(row.retry_after)});
 return {remaining:Math.max(0,limit-row.hits)};
}
