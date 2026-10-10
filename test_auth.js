import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import handler from './server/handler.js';
import {canRead,canAct,requireAdmin,reviewDecision,fieldsOnly,safeComplaint} from './server/policy.js';
const student={id:'student-a',role:'student',account_status:'active',department:'CS'};
const hod={id:'staff-a',role:'HOD',account_status:'active',department:'CS'};
const complaint={id:'c1',owner_user_id:'student-a',department:'CS',assigned_authority:'HOD',verification_status:'Submitted'};
test('Student can read their own report',()=>assert.equal(canRead(student,complaint),true));
test('Student A cannot read Student B report',()=>assert.equal(canRead(student,{...complaint,owner_user_id:'student-b'}),false));
test('Student cannot perform authority actions',()=>assert.equal(canAct(student,complaint),false));
test('HOD is scoped to assigned tier',()=>assert.equal(canRead(hod,{...complaint,assigned_authority:'Dean'}),false));
test('HOD is scoped to approved department',()=>assert.equal(canRead(hod,{...complaint,department:'ME'}),false));
test('Unknown roles fail closed',()=>assert.equal(canRead({...student,role:'superuser'},complaint),false));
test('Suspended staff cannot read cases',()=>assert.equal(canRead({...hod,account_status:'suspended'},complaint),false));
test('Higher Authority can review lower tiers',()=>assert.equal(canAct({...hod,role:'Higher Authority'},complaint),true));
test('Student cannot enter admin endpoints',()=>assert.throws(()=>requireAdmin(student),{status:403}));
test('Approved admin can enter admin endpoints',()=>assert.doesNotThrow(()=>requireAdmin({...student,role:'admin'})));
test('Profile mutation rejects client-supplied role',()=>assert.throws(()=>fieldsOnly({department:'CS',role:'admin'},['department','staff_requested']),{status:422}));
test('Complaint mutation rejects forged ownership',()=>assert.throws(()=>fieldsOnly({owner_user_id:'student-b'},['category','description']),{status:422}));
test('Human verification rejects skipped resolution',()=>assert.throws(()=>reviewDecision(hod,complaint,{verification_status:'Resolved',notes:'Fictional detailed reasons.'}),{status:422}));
test('Human verification requires supporting reasons',()=>assert.throws(()=>reviewDecision(hod,complaint,{verification_status:'Identity Verified',notes:'short'}),{status:422}));
test('Human identity verification accepts valid step',()=>assert.doesNotThrow(()=>reviewDecision(hod,complaint,{verification_status:'Identity Verified',notes:'Google identity checked by an authorized reviewer.'})));
test('Student cannot record human findings',()=>assert.throws(()=>reviewDecision(student,complaint,{verification_status:'Identity Verified',notes:'Fictional detailed reasons.'}),{status:403}));
test('Findings Recorded requires explicit human outcome',()=>assert.throws(()=>reviewDecision(hod,{...complaint,verification_status:'Under Review'},{verification_status:'Findings Recorded',notes:'Detailed committee review findings.'}),{status:422}));
test('Inconclusive human findings are supported',()=>assert.doesNotThrow(()=>reviewDecision(hod,{...complaint,verification_status:'Under Review'},{verification_status:'Findings Recorded',notes:'Committee cannot substantiate based on available material.',allegation_status:'Inconclusive'})));
test('Student serialization excludes internal notes and identities',()=>{const safe=safeComplaint({...complaint,notes:'private',reporter_email:'private@example.test'});assert.equal(safe.notes,undefined);assert.equal(safe.reporter_email,undefined);assert.equal(safe.owner_user_id,undefined);});
test('Direct API denies unauthenticated/private and privilege requests',async()=>{
 const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const saved={APP_ORIGIN:process.env.APP_ORIGIN,DATABASE_URL:process.env.DATABASE_URL,GOOGLE_CLIENT_ID:process.env.GOOGLE_CLIENT_ID};
 process.env.APP_ORIGIN=origin;delete process.env.DATABASE_URL;delete process.env.GOOGLE_CLIENT_ID;
 try {
  for(const path of ['complaints','complaints/00000000-0000-0000-0000-000000000000','admin/users','admin/audit','me']) assert.equal((await fetch(origin+'/api/'+path)).status,503);
  const cross=await fetch(origin+'/api/admin/roles',{method:'PATCH',headers:{Origin:'https://attacker.invalid','Content-Type':'application/json'},body:JSON.stringify({role:'admin'})});assert.equal(cross.status,403);
  const configuration=await (await fetch(origin+'/api/config')).json();assert.equal(configuration.ready,false);assert.equal(configuration.DATABASE_URL,undefined);
  const login=await fetch(origin+'/api/auth/google',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({credential:'fake'})});assert.equal(login.status,503);
 }finally{await new Promise(resolve=>server.close(resolve));for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

import {sessionUser,logout,digest,cookie} from './server/auth.js';
import {appOrigin,databaseOptions,intakeEnabled} from './server/config.js';
import {createHandler} from './server/handler.js';
test('APP_ORIGIN rejects paths, credentials, remote HTTP and production HTTP',()=>{
 for(const origin of ['https://example.test/path','https://user:pass@example.test','http://example.test','https://example.test?x=1','https://example.test#fragment'])
 assert.throws(()=>appOrigin({APP_ORIGIN:origin}),{status:503});
 assert.throws(()=>appOrigin({APP_ORIGIN:'http://localhost:5501',NODE_ENV:'production'}),{status:503});
 assert.equal(appOrigin({APP_ORIGIN:'http://localhost:5501'}),'http://localhost:5501');
});
test('PostgreSQL TLS cannot be disabled in production or overridden by URL',()=>{
 assert.throws(()=>databaseOptions({DATABASE_URL:'postgres://localhost/aegis',DATABASE_SSL:'false',NODE_ENV:'production'}),{status:503});
 assert.throws(()=>databaseOptions({DATABASE_URL:'postgres://example.test/aegis',DATABASE_SSL:'false'}),{status:503});
 const options=databaseOptions({DATABASE_URL:'postgres://example.test/aegis?sslmode=no-verify&sslcert=bad',NODE_ENV:'production'});
 assert.equal(options.ssl.rejectUnauthorized,true);assert.equal(new URL(options.connectionString).search,'');
});
test('Authenticated intake remains off by default',()=>assert.equal(intakeEnabled({}),false));
test('Verification rejects extra fields, invalid empty values and excessive notes',()=>{
 const valid={verification_status:'Identity Verified',notes:'Authorized fictional review supporting reasons.'};
 for(const input of [{...valid,role:'admin'},{...valid,evidence_status:''},{...valid,allegation_status:null},{...valid,notes:'x'.repeat(10001)}])
 assert.throws(()=>reviewDecision(hod,complaint,input),{status:422});
});
test('Expired sessions rejected, valid sessions revoked by logout, malformed cookies cleared',async()=>{
 const previous=process.env.APP_ORIGIN;process.env.APP_ORIGIN='https://example.test';
 const token='a'.repeat(43),req={headers:{cookie:'aegis_session='+token}};
 let stored={...student,session_expires_at:new Date(Date.now()-1000).toISOString()};
 const db={query:async(sql,values)=>{
  assert.equal(values[0],digest(token));
  if(sql.startsWith('DELETE')){stored=null;return {rowCount:1};}
  assert.match(sql,/expires_at>now\(\)/);return {rows:stored?[stored]:[]};
 }};
 const headers={};const res={setHeader:(name,value)=>headers[name]=value};
 try{
  await assert.rejects(sessionUser(req,db),{status:401});
  stored={...student,session_expires_at:new Date(Date.now()+100000).toISOString()};
  assert.equal((await sessionUser(req,db)).id,student.id);
  await logout(req,res,db);assert.ok(headers['Set-Cookie'].every(value=>value.includes('Max-Age=0')&&value.includes('Secure')&&value.includes('HttpOnly')));
  await assert.rejects(sessionUser(req,db),{status:401});
  await logout({headers:{cookie:'aegis_session=invalid'}},res,{query:()=>assert.fail('Malformed token must not query database')});
  assert.ok(headers['Set-Cookie'][0].includes('Max-Age=0'));
 }finally{if(previous===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=previous;}
});
test('HTTP logout bypasses expired session lookup but rejects CSRF first',async()=>{
 let lookedUp=false,deleted=false;
 const server=http.createServer(createHandler({
 sessionUser:async()=>{lookedUp=true;throw Object.assign(Error('Expired'),{status:401});},
 logout:async(req,res)=>{deleted=true;res.setHeader('Set-Cookie','aegis_session=; HttpOnly; SameSite=Strict; Max-Age=0');}
 }));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,previous=process.env.APP_ORIGIN;
 process.env.APP_ORIGIN=origin;
 try{
  for(const untrusted of ['https://attacker.test','null',undefined]){
   const headers={'Content-Type':'application/json'};if(untrusted!==undefined)headers.Origin=untrusted;
   assert.equal((await fetch(origin+'/api/auth/logout',{method:'POST',headers,body:'{}'})).status,403);
   assert.equal(deleted,false);
  }
  const response=await fetch(origin+'/api/auth/logout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'aegis_session=expired'},body:'{}'});
  assert.equal(response.status,200);assert.equal(deleted,true);assert.equal(lookedUp,false);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
 }finally{await new Promise(resolve=>server.close(resolve));if(previous===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=previous;}
});

test('Production intake requires LIVE_INTAKE_ENABLED=true and valid configuration',()=>{
 assert.equal(intakeEnabled({APP_ORIGIN:'https://aegis-command-x.vercel.app',DATABASE_URL:'postgres://example.test/aegis',GOOGLE_CLIENT_ID:'123-test.apps.googleusercontent.com',LIVE_INTAKE_ENABLED:'false',NODE_ENV:'production'}),false);
 assert.equal(intakeEnabled({APP_ORIGIN:'https://aegis-command-x.vercel.app',DATABASE_URL:'postgres://example.test/aegis',GOOGLE_CLIENT_ID:'123-test.apps.googleusercontent.com',LIVE_INTAKE_ENABLED:'true',NODE_ENV:'production'}),true);
});
test('Actual complaint endpoints enforce ownership, department scope and payload validation',async()=>{
 const keys=['APP_ORIGIN','DATABASE_URL','GOOGLE_CLIENT_ID','LIVE_INTAKE_ENABLED','NODE_ENV','VERCEL'];
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 delete process.env.VERCEL;process.env.NODE_ENV='test';process.env.DATABASE_URL='postgres://localhost/fictional';
 process.env.GOOGLE_CLIENT_ID='123-test.apps.googleusercontent.com';process.env.LIVE_INTAKE_ENABLED='true';
 let currentUser=student,currentComplaint={...complaint,id:'00000000-0000-0000-0000-000000000001',owner_user_id:'student-b'};
 const db={query:async()=>({rows:[currentComplaint],rowCount:1})};
 const server=http.createServer(createHandler({sessionUser:async()=>currentUser,logout},{database:()=>db,transaction:fn=>fn(db)},{consumeRateLimit:async()=>({remaining:100})}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;process.env.APP_ORIGIN=origin;
 const path=origin+'/api/complaints/'+currentComplaint.id;
 const patch=(value,headers={})=>fetch(path+'/verification',{method:'PATCH',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(value)});
 try{
  assert.equal((await fetch(path)).status,404);
  currentUser={...hod,department:'ME'};assert.equal((await fetch(path)).status,404);
  assert.equal((await patch({verification_status:'Identity Verified',notes:'Fictional authorization review.'})).status,404);
  currentUser=hod;
  assert.equal((await patch({verification_status:'Resolved',notes:'Fictional authorization review.'})).status,422);
  assert.equal((await patch({verification_status:'Identity Verified',notes:'Fictional authorization review.',role:'admin'})).status,422);
  assert.equal((await patch({verification_status:'Identity Verified',notes:'Fictional authorization review.'},{Origin:'https://attacker.test'})).status,403);
  currentUser=student;assert.equal((await fetch(origin+'/api/admin/users')).status,403);
 }finally{await new Promise(resolve=>server.close(resolve));for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
