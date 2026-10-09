import {database} from '../server/db.js';
const db=database();
try {
 const client=await db.connect();
 try {if(client.connection.stream.encrypted!==true||client.connection.stream.authorized!==true) throw new Error('Verified client TLS connection required.');}finally{client.release();}
 const tables=await db.query("SELECT count(*)::int AS total FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1)",[['users','complaints','sessions','auth_challenges','complaint_evidence','verification_reviews','audit_logs','case_links','rate_limits']]);
 if(tables.rows[0].total!==9) throw new Error('Apply migrations before activation.');
 console.log('PostgreSQL health passed: TLS verified and all 9 application tables present.');
} catch(error) {console.error('Database health failed:',error.code||error.name);process.exitCode=1;}
finally {await db.end();}
