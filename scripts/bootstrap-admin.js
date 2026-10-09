import {database,transaction} from '../server/db.js';
const subject=process.argv[2];
if(!subject || !/^[0-9]+$/.test(subject)) throw new Error('Supply the verified Google subject ID of an existing account: npm run admin:bootstrap -- <subject>');
try {
 await transaction(async db=>{
 const result=await db.query("UPDATE users SET role='admin',account_status='active' WHERE google_subject_id=$1 RETURNING id",[subject]);
 if(result.rowCount!==1) throw new Error('Existing Google account not found.');
 await db.query("DELETE FROM sessions WHERE user_id=$1",[result.rows[0].id]);
 await db.query("INSERT INTO audit_logs(actor_id,action) VALUES($1,'TRUSTED_ADMIN_BOOTSTRAP')",[result.rows[0].id]);
 });
 console.log('Administrator assigned by trusted server-side operator.');
} finally { await database().end(); }
