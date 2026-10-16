// Explicit disposable-local PostgreSQL only. No .env loading, provider calls or mail.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import pg from 'pg';
import {migrationBody} from './scripts/migration-sql.js';
import {login,sessionUser,digest,issueStepUpToken} from './server/auth.js';
import {linkConfirmedGoogleAccount} from './server/google-identity.js';
import {eligibleRoster} from './server/enrollment.js';
import {createHandler} from './server/handler.js';
import {transaction as databaseTransaction} from './server/db.js';

const configArg=process.argv.find(x=>x.startsWith('--local-config='))?.slice(15)||process.env.AEGIS_PHASE12_LOCAL_CONFIG;
if(!configArg) throw Error('Explicit disposable local cluster configuration required.');
const config=JSON.parse(fs.readFileSync(configArg,'utf8'));
if(config.host!=='127.0.0.1'||config.user!=='phase12_operator'||!Number.isInteger(config.port)||!config.dataDirectory?.replaceAll('\\','/').endsWith('/.verification/phase12/cluster')) throw Error('Refusing non-Phase-1.2 local cluster.');
const options={host:config.host,port:config.port,user:config.user,password:config.password,ssl:false,connectionTimeoutMillis:5000,statement_timeout:10000};
const tx=pool=>fn=>databaseTransaction(fn,pool);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const clientId='123-phase12.apps.googleusercontent.com';
process.env.NODE_ENV='test';delete process.env.VERCEL;
process.env.APP_ORIGIN='http://127.0.0.1:5173';process.env.DATABASE_SSL='false';process.env.GOOGLE_CLIENT_ID=clientId;
process.env.LIVE_INTAKE_ENABLED='false';delete process.env.TEST_OVERRIDE_INTAKE;
const claim=(sub,email,nonce)=>({iss:'https://accounts.google.com',aud:clientId,exp:Date.now()/1000+3600,sub,email,email_verified:true,nonce});

test('Phase 1.2 real PostgreSQL: independent 006 and 007 databases',async t=>{
 const admin=new pg.Pool({...options,database:'postgres'});const suffix=randomBytes(6).toString('hex');
 const role='phase12_runtime_'+suffix;const password=randomBytes(24).toString('hex');
 const pools=[];const manifests=[];
 try{
  const identity=(await admin.query('SELECT current_user,host(inet_server_addr()) host,version(),current_setting(\'data_directory\') directory')).rows[0];
  assert.equal(identity.current_user,config.user);assert.equal(identity.host,'127.0.0.1');
  assert.equal(path.resolve(identity.directory).toLowerCase(),path.resolve(config.dataDirectory).toLowerCase());
  await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  for(const boundary of [6,7]){
   const database='isolated_aegis_phase12_'+boundary+'_'+suffix;
   await admin.query(`CREATE DATABASE ${database}`);
   const operator=new pg.Pool({...options,database});pools.push(operator);
   const migrations=fs.readdirSync('migrations').filter(n=>/^00[1-7]_/.test(n)).sort().slice(0,boundary);
   await tx(operator)(async c=>{for(const name of migrations){const sql=fs.readFileSync('migrations/'+name,'utf8');await c.query(migrationBody(sql));}});
   await operator.query(`GRANT CONNECT ON DATABASE ${database} TO ${role}`);
   await operator.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}; REVOKE UPDATE,DELETE,TRUNCATE ON audit_logs FROM ${role}`);
   const runtime=new pg.Pool({...options,database,user:role,password,max:8,application_name:'aegis_phase12_synthetic'});pools.push(runtime);
   process.env.DATABASE_URL=`postgresql://${role}:${password}@127.0.0.1:${config.port}/${database}`;
   const transaction=tx(runtime);
   const schema=boundary===7;const inst=schema?(await operator.query("SELECT * FROM institutions WHERE slug='default'")).rows[0]:null;
   if(schema)await operator.query("UPDATE institutions SET name='Synthetic Phase 1.2 Institution',domains=ARRAY['campus.example.test']");
   const makeUser=async overrides=>{
    const id=randomUUID();const email=overrides?.email||'synthetic.'+id+'@example.test';
    const u=(await operator.query("INSERT INTO users(id,email,name,google_subject_id,role,is_primary_owner,mfa_enrolled,action_pin_set_at) VALUES($1,$2,'Synthetic Fixture',$3,$4,$5,true,now()) RETURNING *",[id,email,overrides?.sub||null,overrides?.role||'student',Boolean(overrides?.owner)])).rows[0];
    u.session_hash=digest(randomBytes(32));await operator.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[u.session_hash,u.id]);
    return u;
   };
   const staff=await makeUser({role:'admin'});staff.permissions=['departments.manage','roster.conflicts.manage','roster.import','department.students.verify'];
   const owner=await makeUser({role:'admin',owner:true});
   process.env.PRIMARY_OWNER_USER_ID=owner.id;process.env.PRIMARY_OWNER_EMAIL=owner.email;
   const ownerGrant=randomBytes(32).toString('base64url');await operator.query("INSERT INTO owner_portal_grants(token_hash,user_id,session_hash,pin_set_at,expires_at) SELECT $1,id,$2,action_pin_set_at,now()+interval '1 hour' FROM users WHERE id=$3",[digest(ownerGrant),owner.session_hash,owner.id]);
   const call=async(endpoint,input,user=staff,run=transaction)=>{
    let data;const res={statusCode:0,setHeader(){},end(raw){data=JSON.parse(raw);}};
    const handler=createHandler({sessionUser:async()=>user,logout:async()=>{}},{database:()=>runtime,transaction:run},{consumeRateLimit:async()=>({})});
    await handler({method:'POST',url:'/api/'+endpoint,headers:{origin:process.env.APP_ORIGIN,'content-type':'application/json','x-aegis-owner-grant':ownerGrant},body:input},res);
    return {status:res.statusCode,data};
   };
   const privileged=async(endpoint,input,user=staff,run)=>call(endpoint,{...input,stepUpToken:await issueStepUpToken(user.id,'admin_step_up',runtime,user.session_hash)},user,run);
   const makeRoster=async({email,reg,name='Synthetic Student',testRecord=false}={})=>{
    const values=[reg||randomBytes(6).toString('hex').toUpperCase(),email||randomUUID()+'@campus.example.test',name];
    return (await operator.query(schema?"INSERT INTO student_rosters(register_number,institutional_email,full_name,department_code,batch_year,institution_id,is_test_record) VALUES($1,$2,$3,'CSE','2026',$4,$5) RETURNING *":"INSERT INTO student_rosters(register_number,institutional_email,full_name,department_code,batch_year) VALUES($1,$2,$3,'CSE','2026') RETURNING *",schema?[...values,inst.id,testRecord]:values)).rows[0];
   };
   const request=async(u,r)=> (await operator.query(schema?"INSERT INTO student_verification_requests(user_id,roster_id,institution_id,claim_channel) VALUES($1,$2,$3,'STUDENT_MANUAL_CLAIM') RETURNING *":"INSERT INTO student_verification_requests(user_id,roster_id,claim_channel) VALUES($1,$2,'STUDENT_MANUAL_CLAIM') RETURNING *",schema?[u.id,r.id,inst.id]:[u.id,r.id])).rows[0];
   const approve=(r,user=owner,run)=>privileged('owner/verification-claims/'+r.id+'/review',{decision:'APPROVED',notes:'Synthetic independent enrollment review only',verificationMethod:'DEPT_ACADEMIC_RECORD',identityEvidenceReference:'SYNTHETIC-REGISTER-2026'},user,run);
   const googleLogin=async(u,nonce=randomBytes(24).toString('hex'),run=transaction)=>{
    await operator.query("INSERT INTO auth_challenges(token_hash,expires_at) VALUES($1,now()+interval '5 minutes')",[digest(nonce)]);
    const claims={...claim(u.google_subject_id,u.email,nonce),name:'Changed Synthetic Profile'};
    const invoke=()=>login({headers:{cookie:'aegis_challenge='+nonce}},{setHeader(){}},'synthetic-verified-token',{runTransaction:run,verifyCredential:async()=>claims});
    return {invoke,nonce};
   };
   await t.test(boundary+': runtime separation and migration boundary',async()=>{
    const r=(await runtime.query("SELECT current_user,has_schema_privilege(current_user,'public','CREATE') ddl,has_table_privilege(current_user,'audit_logs','DELETE') audit_delete")).rows[0];
    assert.equal(r.current_user,role);assert.equal(r.ddl,false);assert.equal(r.audit_delete,false);assert.equal(Boolean((await runtime.query("SELECT to_regclass('public.institutions') x")).rows[0].x),schema);
   });
   await t.test(boundary+': department creation uses the correct schema',async()=>{
    const r=await privileged('admin/departments',{code:'TEST'+boundary,name:'Synthetic Department '+boundary});assert.equal(r.status,201,JSON.stringify(r));
    if(schema)assert.equal(r.data.department.institution_id,inst.id);
   });
   await t.test(boundary+': conflict resolution includes required institution and rejects bound identities',async()=>{
    const r=await makeRoster();
    const conflict=(await operator.query("INSERT INTO roster_import_conflicts(batch_id,register_number,institutional_email,department_code,conflict_type,raw_payload) VALUES($1,$2,$3,'CSE','REGISTER_EXISTS_MISMATCH',$4) RETURNING *",[randomUUID(),r.register_number,r.institutional_email,JSON.stringify({registerNumber:r.register_number,institutionalEmail:r.institutional_email,fullName:'Synthetic Corrected',departmentCode:'CSE',batchYear:'2026'})])).rows[0];
    const result=await privileged('admin/roster/conflicts/'+conflict.id+'/resolve',{action:'ACCEPTED_UPDATE'});assert.equal(result.status,200,JSON.stringify(result));
    assert.equal((await runtime.query('SELECT full_name FROM student_rosters WHERE id=$1',[r.id])).rows[0].full_name,'Synthetic Corrected');
    const u=await makeUser();await operator.query('UPDATE student_rosters SET bound_user_id=$1 WHERE id=$2',[u.id,r.id]);await operator.query('UPDATE roster_import_conflicts SET resolved=false WHERE id=$1',[conflict.id]);
    assert.equal((await privileged('admin/roster/conflicts/'+conflict.id+'/resolve',{action:'ACCEPTED_UPDATE'})).status,409);
   });
   await t.test(boundary+': same-account concurrent linking preserves one subject',async()=>{
    const u=await makeUser();const results=await Promise.allSettled(['subject-a:','subject-b:'].map(prefix=>transaction(db=>linkConfirmedGoogleAccount(db,u.id,claim(prefix+u.id,u.email,'nonce')))));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
   });
   await t.test(boundary+': concurrent accounts cannot acquire the same Google subject',async()=>{
    const a=await makeUser(),b=await makeUser();const sub='competing:'+randomUUID();
    const results=await Promise.allSettled([a,b].map(u=>transaction(db=>linkConfirmedGoogleAccount(db,u.id,claim(sub,u.email,'nonce')))));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
    assert.equal((await runtime.query('SELECT count(*)::int n FROM users WHERE google_subject_id=$1',[sub])).rows[0].n,1);
   });
   await t.test(boundary+': duplicate Google subjects and lower-case emails are constrained',async()=>{
    const u=await makeUser({sub:'unique:'+randomUUID()});await assert.rejects(()=>makeUser({sub:u.google_subject_id}),{code:'23505'});await assert.rejects(()=>makeUser({email:u.email.toUpperCase()}),{code:'23505'});
    const v=await makeUser();await assert.rejects(()=>transaction(db=>linkConfirmedGoogleAccount(db,v.id,claim(u.google_subject_id,v.email,'nonce'))),{status:409});
   });
   await t.test(boundary+': Google login concurrent replay commits exactly once',async()=>{
    const u=await makeUser({sub:'replay:'+randomUUID()});const f=await googleLogin(u);const results=await Promise.allSettled([f.invoke(),f.invoke()]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===401).length,1);await assert.rejects(f.invoke,{status:401});
   });
   await t.test(boundary+': failed login transaction restores challenge and rolls back profile/session writes',async()=>{
    const u=await makeUser({sub:'rollback:'+randomUUID()});const before=(await runtime.query('SELECT count(*)::int n FROM sessions WHERE user_id=$1',[u.id])).rows[0].n;
    const broken=fn=>transaction(async db=>{await fn(db);throw Error('synthetic failure before commit');});const f=await googleLogin(u,undefined,broken);
    await assert.rejects(f.invoke,/synthetic failure/);assert.equal((await runtime.query('SELECT count(*)::int n FROM auth_challenges WHERE token_hash=$1',[digest(f.nonce)])).rows[0].n,1);
    assert.equal((await runtime.query('SELECT count(*)::int n FROM sessions WHERE user_id=$1',[u.id])).rows[0].n,before);
    assert.equal((await runtime.query('SELECT name FROM users WHERE id=$1',[u.id])).rows[0].name,'Synthetic Fixture');
   });
   if(!schema){
    await t.test('6: authentication survives, unsupported enrollment fails closed',async()=>{
     const u=await makeUser({sub:'legacy:'+randomUUID()});const r=await makeRoster({email:u.email});const f=await googleLogin(u);assert.equal((await f.invoke()).is_verified_student,false);
     await operator.query('UPDATE users SET roster_id=$1,is_verified_student=true WHERE id=$2',[r.id,u.id]);await operator.query('UPDATE student_rosters SET bound_user_id=$1 WHERE id=$2',[u.id,r.id]);
     const token=randomBytes(32).toString('base64url');await operator.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[digest(token),u.id]);
     assert.equal((await sessionUser({headers:{cookie:'aegis_session='+token}},runtime)).is_verified_student,false);
     assert.equal((await call('student/verification-request',{registerNumber:r.register_number},u)).status,503);
    });
   }else{
    await t.test('7: automatic verification rejects test rosters and inactive institutions',async()=>{
     const u=await makeUser({sub:'excluded:'+randomUUID(),email:randomUUID()+'@campus.example.test'});const r=await makeRoster({email:u.email,testRecord:true});
     let f=await googleLogin(u);assert.equal((await f.invoke()).is_verified_student,false);
     await operator.query('UPDATE student_rosters SET is_test_record=false WHERE id=$1',[r.id]);await operator.query('UPDATE institutions SET active=false WHERE id=$1',[inst.id]);
     f=await googleLogin(u);assert.equal((await f.invoke()).is_verified_student,false);
     assert.equal((await runtime.query('SELECT bound_user_id FROM student_rosters WHERE id=$1',[r.id])).rows[0].bound_user_id,null);
     await operator.query('UPDATE institutions SET active=true WHERE id=$1',[inst.id]);
    });
    await t.test('7: exact authoritative Google enrollment succeeds',async()=>{
     const u=await makeUser({sub:'auto:'+randomUUID(),email:randomUUID()+'@campus.example.test'});const r=await makeRoster({email:u.email});const f=await googleLogin(u);const result=await f.invoke();assert.equal(result.is_verified_student,true);assert.equal(result.roster_id,r.id);
    });
    await t.test('7: manual and continuing eligibility exclude test and inactive institutions',async()=>{
     const u=await makeUser();const r=await makeRoster({testRecord:true});const req=await request(u,r);assert.equal((await approve(req)).status,409);
     await operator.query('UPDATE student_rosters SET is_test_record=false WHERE id=$1',[r.id]);await operator.query('UPDATE institutions SET active=false WHERE id=$1',[inst.id]);assert.equal((await approve(req)).status,409);assert.equal(await eligibleRoster(runtime,r.id),null);
     await operator.query('UPDATE institutions SET active=true WHERE id=$1',[inst.id]);assert.equal((await approve(req)).status,200);
     const token=randomBytes(32).toString('base64url');await operator.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[digest(token),u.id]);
     assert.equal((await sessionUser({headers:{cookie:'aegis_session='+token}},runtime)).is_verified_student,true);
     await operator.query('UPDATE institutions SET active=false WHERE id=$1',[inst.id]);
     assert.equal((await sessionUser({headers:{cookie:'aegis_session='+token}},runtime)).is_verified_student,false);
     await operator.query('UPDATE institutions SET active=true WHERE id=$1',[inst.id]);
     await operator.query('UPDATE student_rosters SET is_test_record=true WHERE id=$1',[r.id]);assert.equal((await sessionUser({headers:{cookie:'aegis_session='+token}},runtime)).is_verified_student,false);
    });
    await t.test('7: delegated review persists the institutional evidence method',async()=>{
     const u=await makeUser();const r=await makeRoster();const req=await request(u,r);
     const result=await privileged('authority/students/requests/'+req.id+'/review',{decision:'APPROVED',notes:'Synthetic independently checked record',verificationMethod:'DEPT_ACADEMIC_RECORD',identityEvidenceReference:'SYNTHETIC-LEDGER-44'});
     assert.equal(result.status,200,JSON.stringify(result));assert.equal((await runtime.query('SELECT verification_method FROM student_verification_requests WHERE id=$1',[req.id])).rows[0].verification_method,'DEPT_ACADEMIC_RECORD');
    });
    await t.test('7: inactive department and institution mismatch deny manual verification',async()=>{
     const u=await makeUser();const r=await makeRoster();const req=await request(u,r);
     await operator.query("UPDATE departments SET active=false WHERE code='CSE'");assert.equal((await approve(req)).status,409);
     await operator.query("UPDATE departments SET active=true WHERE code='CSE'");
     const other=(await operator.query("INSERT INTO institutions(slug,name) VALUES('synthetic-other','Synthetic Other Institution') RETURNING id")).rows[0];
     await operator.query('UPDATE student_rosters SET institution_id=$1 WHERE id=$2',[other.id,r.id]);assert.equal((await approve(req)).status,409);
    });
    await t.test('7: expiry is enforced in a real approval transaction',async()=>{
     const u=await makeUser();const r=await makeRoster();const req=await request(u,r);await operator.query("UPDATE student_verification_requests SET expires_at=now()-interval '1 second' WHERE id=$1",[req.id]);assert.equal((await approve(req)).status,400);assert.equal((await runtime.query('SELECT bound_user_id FROM student_rosters WHERE id=$1',[r.id])).rows[0].bound_user_id,null);
    });
    await t.test('7: conflicting reciprocal roster binding cannot be reassigned',async()=>{
     const u=await makeUser(),other=await makeUser();const r=await makeRoster();const req=await request(u,r);await operator.query('UPDATE student_rosters SET bound_user_id=$1 WHERE id=$2',[other.id,r.id]);assert.equal((await approve(req)).status,409);
     assert.equal((await runtime.query('SELECT bound_user_id FROM student_rosters WHERE id=$1',[r.id])).rows[0].bound_user_id,other.id);
    });
    await t.test('7: approval cannot reassign a user already bound to another roster',async()=>{
     const u=await makeUser();const original=await makeRoster(),target=await makeRoster();const req=await request(u,target);
     await operator.query('UPDATE student_rosters SET bound_user_id=$1 WHERE id=$2',[u.id,original.id]);await operator.query('UPDATE users SET roster_id=$1 WHERE id=$2',[original.id,u.id]);
     assert.equal((await approve(req)).status,409);assert.equal((await runtime.query('SELECT roster_id FROM users WHERE id=$1',[u.id])).rows[0].roster_id,original.id);
    });
    await t.test('7: failed roster batch rolls back preceding inserts',async()=>{
     const reg=randomBytes(6).toString('hex').toUpperCase();
     const result=await privileged('admin/roster/import',{records:[{registerNumber:reg,institutionalEmail:randomUUID()+'@campus.example.test',fullName:'Valid Synthetic',departmentCode:'CSE',batchYear:'2026'},{registerNumber:randomBytes(6).toString('hex').toUpperCase(),institutionalEmail:randomUUID()+'@campus.example.test',fullName:'Invalid Synthetic Batch',departmentCode:'CSE',batchYear:'invalid'}]});
     assert.equal(result.status,503);assert.equal((await runtime.query('SELECT 1 FROM student_rosters WHERE register_number=$1',[reg])).rowCount,0);
    });
    await t.test('7: explicit foreign institution is rejected without fallback',async()=>{
     const result=await privileged('admin/departments',{code:'BADINST',name:'Must Not Exist',institutionSlug:'missing-synthetic'});assert.equal(result.status,422);
     assert.equal((await runtime.query("SELECT 1 FROM departments WHERE code='BADINST'")).rowCount,0);
    });
    await t.test('7: competing approval transactions bind and audit once',async()=>{
     const u=await makeUser();const r=await makeRoster();const req=await request(u,r);const results=await Promise.all([approve(req),approve(req)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
     assert.equal((await runtime.query("SELECT count(*)::int n FROM audit_logs WHERE action='STUDENT_VERIFICATION_OWNER_APPROVED' AND details->>'claimId'=$1",[req.id])).rows[0].n,1);
    });
    await t.test('7: import waits for approval and cannot overwrite the bound roster',async()=>{
     const u=await makeUser();const r=await makeRoster({name:'Original Synthetic Name'});const req=await request(u,r);const held=deferred(),release=deferred();
     const gated=fn=>transaction(async db=>{const result=await fn(db);held.resolve();await release.promise;return result;});
     const approval=approve(req,owner,gated);await held.promise;
     const imported=privileged('admin/roster/import',{records:[{registerNumber:r.register_number,institutionalEmail:r.institutional_email,fullName:'Concurrent Changed Name',departmentCode:'CSE',batchYear:'2026'}]});
     try{let waiting=false;for(let i=0;i<100;i++){waiting=Boolean((await operator.query("SELECT 1 FROM pg_stat_activity WHERE application_name='aegis_phase12_synthetic' AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM student_rosters WHERE register_number=%' ")).rowCount);if(waiting)break;await new Promise(r=>setTimeout(r,20));}assert.equal(waiting,true,'Import must block on the approval row lock');}
     finally{release.resolve();}
     assert.equal((await approval).status,200);const result=await imported;assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.importedCount,0);
     const after=(await runtime.query('SELECT * FROM student_rosters WHERE id=$1',[r.id])).rows[0];assert.equal(after.full_name,r.full_name);assert.equal(after.bound_user_id,u.id);
    });
    await t.test('7: approval waits for an earlier import and binds the committed record',async()=>{
     const u=await makeUser();const r=await makeRoster();const req=await request(u,r);const held=deferred(),release=deferred();
     const gated=fn=>transaction(async db=>{const result=await fn(db);held.resolve();await release.promise;return result;});
     const importing=privileged('admin/roster/import',{records:[{registerNumber:r.register_number,institutionalEmail:r.institutional_email,fullName:'Updated Before Binding',departmentCode:'CSE',batchYear:'2026'}]},staff,gated);await held.promise;const approval=approve(req);
     try{let waiting=false;for(let i=0;i<100;i++){waiting=Boolean((await operator.query("SELECT 1 FROM pg_stat_activity WHERE application_name='aegis_phase12_synthetic' AND wait_event_type='Lock' AND query LIKE '%FROM student_verification_requests svr%' ")).rowCount);if(waiting)break;await new Promise(r=>setTimeout(r,20));}assert.equal(waiting,true);}
     finally{release.resolve();}
     assert.equal((await importing).status,200);assert.equal((await approval).status,200);
     const row=(await runtime.query('SELECT * FROM student_rosters WHERE id=$1',[r.id])).rows[0];assert.equal(row.full_name,'Updated Before Binding');assert.equal(row.bound_user_id,u.id);
    });
    await t.test('7: concurrent imports cannot overwrite or reassign a bound identity',async()=>{
     const u=await makeUser();const r=await makeRoster();await operator.query('UPDATE student_rosters SET bound_user_id=$1 WHERE id=$2',[u.id,r.id]);
     const payload={records:[{registerNumber:r.register_number,institutionalEmail:r.institutional_email,fullName:'Must Not Replace',departmentCode:'CSE',batchYear:'2026'}]};const results=await Promise.all([privileged('admin/roster/import',payload),privileged('admin/roster/import',payload)]);assert.ok(results.every(r=>r.status===200&&r.data.importedCount===0));assert.equal((await runtime.query('SELECT full_name FROM student_rosters WHERE id=$1',[r.id])).rows[0].full_name,r.full_name);
    });
   }
   manifests.push({boundary,database,host:'127.0.0.1',runtimeRole:role,migrations:migrations.map(name=>({name,sha256:createHash('sha256').update(fs.readFileSync('migrations/'+name,'utf8').replaceAll('\r\n','\n')).digest('hex')}))});
  }
  console.log('ISOLATION_EVIDENCE '+JSON.stringify({version:identity.version,host:identity.host,disposable:true,databases:manifests,provider:'injected verified-claim fixtures; no OAuth',mail:'none',runtime:'synthetic DML role, no schema CREATE, no audit DELETE'}));
 }finally{await Promise.all(pools.map(p=>p.end()));await admin.end();}
});
