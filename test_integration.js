import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import pg from 'pg';
import {databaseOptions} from './server/config.js';
import {createHandler} from './server/handler.js';
import {sessionUser,logout,digest} from './server/auth.js';
import {consumeRateLimit} from './server/rate-limit.js';
import {cleanupExpired,authorizeMaintenance} from './server/maintenance.js';
if(!process.env.MIGRATION_DATABASE_URL||!process.env.DATABASE_URL)throw Error('Dedicated migration and runtime connections required.');
const owner=new pg.Pool({...databaseOptions({...process.env,DATABASE_URL:process.env.MIGRATION_DATABASE_URL}),max:1,connectionTimeoutMillis:15000});
const runtime=new pg.Pool({...databaseOptions(),max:5,connectionTimeoutMillis:15000});
let client,server,passed=0,failed=0;
const previous={...process.env};
const run=async(name,fn)=>{const active=Boolean(client);if(active)await client.query('SAVEPOINT integration_check');try{await fn();passed++;console.log('PASS:',name);}catch(e){if(active)await client.query('ROLLBACK TO SAVEPOINT integration_check');failed++;console.error('FAIL:',name,e.code||e.message);}finally{if(active)await client.query('RELEASE SAVEPOINT integration_check');}};
try{
 client=await owner.connect();
 await client.query('BEGIN');
 const dept='SYNTHETIC-CS-'+randomUUID(),otherDept='SYNTHETIC-ME-'+randomUUID();
 const users={};const tokens={};
 for(const [key,role,department]of [['a','student',dept],['b','student',dept],['hod','HOD',dept],['dean','Dean',dept],['higher','Higher Authority',dept],['admin','admin',dept],['other','HOD',otherDept]]){
  const id=randomUUID();users[key]=id;tokens[key]=randomBytes(32).toString('base64url');
  await client.query('INSERT INTO users(id,google_subject_id,email,name,department,role) VALUES($1,$2,$3,$4,$5,$6)',[id,'synthetic:'+id,key+'@example.test','FICTIONAL INTEGRATION '+key,department,role]);
  await client.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[digest(tokens[key]),id]);
 }
 const expired=randomBytes(32).toString('base64url');
 await client.query("INSERT INTO sessions VALUES($1,$2,now()-interval '1 second')",[digest(expired),users.a]);
 const ids={a:randomUUID(),b:randomUUID(),other:randomUUID(),critical:randomUUID()};
 for(const [key,who,department,severity,tier]of [['a','a',dept,'Low','HOD'],['b','b',dept,'Low','HOD'],['other','b',otherDept,'Low','HOD'],['critical','a',dept,'Critical','Higher Authority']]){
  await client.query("INSERT INTO complaints(id,reference_id,owner_user_id,case_id,department,category,description,severity,urgency,assigned_authority) VALUES($1,$2,$3,$4,$5,'General Campus Grievance','FICTIONAL integration scenario only. No actual allegation.',$6,'Routine',$7)",[ids[key],'SYNTHETIC-'+randomUUID(),users[who],randomUUID(),department,severity,tier]);
 }
 await client.query('SET LOCAL ROLE aegis_runtime');
 let txSerial=0;
 const tx=async fn=>{const save='api_'+(++txSerial);await client.query('SAVEPOINT '+save);try{const out=await fn(client);await client.query('RELEASE SAVEPOINT '+save);return out;}catch(e){await client.query('ROLLBACK TO SAVEPOINT '+save);await client.query('RELEASE SAVEPOINT '+save);throw e;}};
 const auth={sessionUser:req=>sessionUser(req,client),logout:(req,res)=>logout(req,res,client)};
 server=http.createServer(createHandler(auth,{database:()=>client,transaction:tx}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 delete process.env.VERCEL;process.env.NODE_ENV='test';process.env.APP_ORIGIN=origin;process.env.GOOGLE_CLIENT_ID='123-integration.apps.googleusercontent.com';process.env.LIVE_INTAKE_ENABLED='true';
 const request=(who,path,method='GET',data,extra={})=>fetch(origin+'/api/'+path,{method,headers:{Cookie:'aegis_session='+tokens[who],...(method!=='GET'?{Origin:origin,'Content-Type':'application/json'}:{}),...extra},body:data===undefined?undefined:JSON.stringify(data)});
 const payload={category:'General Campus Grievance',description:'FICTIONAL integration scenario only; no actual incident.',identityMode:'anonymous',riskFlags:{}};
 await run('Real client connection uses verified TLS',async()=>{assert.equal(client.connection.stream.encrypted,true);assert.equal(client.connection.stream.authorized,true);});
 await run('Runtime role cannot create databases or roles',async()=>{const r=await client.query("SELECT rolcreatedb,rolcreaterole,rolsuper FROM pg_roles WHERE rolname=current_user");assert.deepEqual(r.rows[0],{rolcreatedb:false,rolcreaterole:false,rolsuper:false});});
 await run('Health endpoint confirms a live database',async()=>assert.equal((await request('a','health')).status,200));
 await run('Student A list excludes Student B records',async()=>{const r=await(await request('a','complaints')).json();assert.equal(r.complaints.length,2);assert.ok(r.complaints.every(c=>[ids.a,ids.critical].includes(c.id)));});
 await run('Student own report is accessible',async()=>assert.equal((await request('a','complaints/'+ids.a)).status,200));
 await run('Student cannot read another owner report',async()=>assert.equal((await request('a','complaints/'+ids.b)).status,404));
 await run('Students cannot mutate staff workflow fields',async()=>assert.equal((await request('a','complaints/'+ids.a+'/status','PATCH',{status:'In Review',notes:'FICTIONAL review notes sufficiently long.'})).status,403));
 await run('HOD list is restricted by department and assigned tier',async()=>{const r=await(await request('hod','complaints')).json();assert.equal(r.complaints.length,2);assert.ok(r.complaints.every(c=>[ids.a,ids.b].includes(c.id)));});
 await run('HOD cross-department access denied',async()=>assert.equal((await request('other','complaints/'+ids.a)).status,404));
 await run('Dean cannot read cases assigned to HOD',async()=>assert.equal((await request('dean','complaints/'+ids.a)).status,404));
 await run('Higher Authority can access lower tiers under policy',async()=>assert.equal((await request('higher','complaints/'+ids.a)).status,200));
 await run('Student administrator endpoint rejected',async()=>assert.equal((await request('a','admin/users')).status,403));
 await run('Trusted synthetic administrator can list accounts',async()=>assert.equal((await request('admin','admin/users')).status,200));
 await run('Cross-owner case linking rejected',async()=>assert.equal((await request('a','complaints','POST',{...payload,linkedComplaintId:ids.b})).status,404));
 await run('Forged complaint ownership fields rejected',async()=>assert.equal((await request('a','complaints','POST',{...payload,owner_user_id:users.b})).status,422));
 await run('Owned second report escalates linked case to Dean',async()=>{const r=await request('a','complaints','POST',{...payload,linkedComplaintId:ids.a});assert.equal(r.status,201);assert.equal((await r.json()).complaint.assigned_authority,'Dean');const original=await client.query('SELECT assigned_authority FROM complaints WHERE id=$1',[ids.a]);assert.equal(original.rows[0].assigned_authority,'Dean');});
 await run('Third report escalates linked case to Higher Authority',async()=>{const r=await request('a','complaints','POST',{...payload,linkedComplaintId:ids.a});assert.equal(r.status,201);assert.equal((await r.json()).complaint.assigned_authority,'Higher Authority');});
 await run('Former HOD scope no longer permits escalated case',async()=>assert.equal((await request('hod','complaints/'+ids.a)).status,404));
 await run('Critical case cannot be downgraded by HOD',async()=>assert.equal((await request('hod','complaints/'+ids.critical+'/routing','PATCH',{targetTier:'HOD',notes:'FICTIONAL unauthorized downgrade attempt.'})).status,404));
 await run('Skipped verification resolution is rejected',async()=>assert.equal((await request('higher','complaints/'+ids.a+'/verification','PATCH',{verification_status:'Resolved',notes:'FICTIONAL authorization review notes.'})).status,422));
 await run('Identity and human findings follow structured transitions',async()=>{
  for(const state of ['Identity Verified','Under Review','Findings Recorded']){
   const r=await request('higher','complaints/'+ids.a+'/verification','PATCH',{verification_status:state,notes:'FICTIONAL internal reviewer notes must remain private.',...(state==='Findings Recorded'?{allegation_status:'Inconclusive'}:{})});
   assert.equal(r.status,200);
  }
 });
 await run('Internal review notes remain private to reporter',async()=>{const r=await(await request('a','complaints/'+ids.a)).json();assert.equal(r.reviews,undefined);assert.equal(r.complaint.allegation_status,'Inconclusive');assert.equal(r.complaint.owner_user_id,undefined);});
 await run('Private evidence authenticity cannot be claimed without storage',async()=>assert.equal((await request('higher','complaints/'+ids.critical+'/verification','PATCH',{verification_status:'Identity Verified',evidence_status:'Authenticity Confirmed',notes:'FICTIONAL unsupported evidence authentication.'})).status,422));
 await run('Expired real PostgreSQL session is rejected',async()=>assert.equal((await request('a','me','GET',undefined,{Cookie:'aegis_session='+expired})).status,401));
 await run('Expired-session logout revokes row and clears cookie',async()=>{const r=await request('a','auth/logout','POST',{}, {Cookie:'aegis_session='+expired});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await client.query('SELECT 1 FROM sessions WHERE token_hash=$1',[digest(expired)])).rowCount,0);});
 await run('Logout invalidates a previously valid session',async()=>{assert.equal((await request('b','auth/logout','POST',{})).status,200);assert.equal((await request('b','me')).status,401);});
 await run('CSRF rejected before authenticated state changes',async()=>assert.equal((await request('a','me','PATCH',{department:dept},{Origin:'https://attacker.invalid'})).status,403));
 await run('Admin suspension revokes all target sessions',async()=>{const r=await request('admin','admin/roles','PATCH',{userId:users.hod,role:'HOD',department:dept,account_status:'suspended'});assert.equal(r.status,200);assert.equal((await request('hod','me')).status,401);});
 await run('Cleanup removes expired challenges but retains active challenges',async()=>{
  const old=digest(randomUUID()),fresh=digest(randomUUID());
  await client.query("INSERT INTO auth_challenges VALUES($1,now()-interval '1 minute'),($2,now()+interval '1 minute')",[old,fresh]);
  await cleanupExpired(client);assert.equal((await client.query('SELECT 1 FROM auth_challenges WHERE token_hash=$1',[old])).rowCount,0);assert.equal((await client.query('SELECT 1 FROM auth_challenges WHERE token_hash=$1',[fresh])).rowCount,1);
 });
 await run('Scheduled maintenance rejects missing and incorrect bearer secrets',async()=>{assert.throws(()=>authorizeMaintenance({headers:{}},'x'.repeat(43)),{status:401});assert.doesNotThrow(()=>authorizeMaintenance({headers:{authorization:'Bearer '+'x'.repeat(43)}},'x'.repeat(43)));});
 await run('Runtime cannot edit append-only audit records',async()=>{await assert.rejects(tx(db=>db.query("UPDATE audit_logs SET action='TAMPERED'")),{code:'42501'});});
 await client.query('ROLLBACK');client.release();client=null;
 await run('Distributed rate limits enforce one quota across concurrent connections',async()=>{
  const bucket='synthetic:'+randomUUID(),hash=createHash('sha256').update(bucket).digest('hex');
  try{const results=await Promise.allSettled(Array.from({length:12},()=>consumeRateLimit(runtime,bucket,5)));assert.equal(results.filter(r=>r.status==='fulfilled').length,5);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===429).length,7);}
  finally{await runtime.query('DELETE FROM rate_limits WHERE bucket_hash=$1',[hash]);}
 });
} catch(error){failed++;console.error('Integration setup failed:',error.code||error.name);}
finally{
 if(client){try{await client.query('ROLLBACK');}finally{client.release();}}
 if(server)await new Promise(resolve=>server.close(resolve));
 await owner.end();await runtime.end();
 for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];
 Object.assign(process.env,previous);
}
console.log('POSTGRESQL INTEGRATION SUMMARY:',passed,'passed,',failed,'failed. Synthetic complaint records rolled back; Google login not activated.');
process.exitCode=failed?1:0;
