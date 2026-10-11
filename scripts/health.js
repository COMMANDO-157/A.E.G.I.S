import {database} from '../server/db.js';
const db=database();
try {
 const client=await db.connect();
 try {if(client.connection.stream.encrypted!==true||client.connection.stream.authorized!==true) throw new Error('Verified client TLS connection required.');}finally{client.release();}
 const expected=[
  'users',
  'complaints',
  'sessions',
  'auth_challenges',
  'complaint_evidence',
  'verification_reviews',
  'audit_logs',
  'case_links',
  'rate_limits',
  'departments',
  'student_rosters',
  'student_verification_requests',
  'authority_assignments',
  'roster_import_conflicts',
  'admin_permissions',
  'admin_invitations',
  'mfa_recovery_codes',
  'step_up_tokens'
 ];
 const tables=await db.query("SELECT count(*)::int AS total FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1)",[expected]);
 if(tables.rows[0].total!==expected.length) throw new Error(`Apply migrations before activation. Expected ${expected.length} tables, found ${tables.rows[0].total}.`);
 console.log(`PostgreSQL health passed: TLS verified and all ${tables.rows[0].total} application tables present.`);
} catch(error) {console.error('Database health failed:',error.code||error.name);process.exitCode=1;}
finally {await db.end();}
