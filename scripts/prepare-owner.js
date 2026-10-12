import pg from 'pg';
import {databaseOptions} from '../server/config.js';
import {ownerDesignationPlan} from '../server/owner-designation.js';

// Read-only production preflight. Never uses the application's DATABASE_URL.
const host='ep-wispy-pond-b33jk0d8.c-4.ap-southeast-1.aws.neon.tech';
let pool;
try {
 const raw=process.env.MIGRATION_DATABASE_URL;
 if(!raw) throw new Error('Verified production operator connection required.');
 const url=new URL(raw);
 if(url.hostname!==host || url.pathname!=='/aegis' || url.username!=='neondb_owner') throw new Error('Production target mismatch. No query executed.');
 const identity={userId:process.env.PRIMARY_OWNER_USER_ID,email:process.env.PRIMARY_OWNER_EMAIL,googleSubject:process.env.PRIMARY_OWNER_GOOGLE_SUBJECT};
 if(!identity.userId||!identity.email||!identity.googleSubject) throw new Error('Explicit candidate identity required. No query executed.');
 pool=new pg.Pool({...databaseOptions({...process.env,NODE_ENV:'production',DATABASE_URL:raw}),max:1,connectionTimeoutMillis:10000});
 const db=await pool.connect();
 try {
  await db.query('BEGIN READ ONLY');
  await db.query("SET LOCAL statement_timeout='10s'");
  const target=(await db.query('SELECT current_database() db,current_user username')).rows[0];
  if(target.db!=='aegis'||target.username!=='neondb_owner') throw new Error('Database identity mismatch.');
  const candidate=(await db.query('SELECT id,email,google_subject_id,account_status,is_primary_owner,mfa_enrolled,action_pin_hash FROM users WHERE id=$1',[identity.userId])).rows[0];
  const owners=(await db.query('SELECT id FROM users WHERE is_primary_owner=true')).rows;
  const plan=ownerDesignationPlan(candidate,owners,identity);
  await db.query('COMMIT');
  console.log(JSON.stringify({project:'icy-dust-49902301',branch:'br-falling-poetry-b3lrse12',database:target.db,...plan},null,2));
 } catch(error) {await db.query('ROLLBACK');throw error;} finally {db.release();}
} catch(error) {
 // Never print a connection string, provider credential, PIN or encrypted secret.
 console.error('Owner preflight blocked:',error.code||error.message);process.exitCode=1;
} finally {await pool?.end();}
