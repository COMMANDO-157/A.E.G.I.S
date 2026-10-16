import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGoogleClaims,linkConfirmedGoogleAccount,requireCurrentClaim,requireVerificationEvidence} from './server/google-identity.js';
import {login} from './server/auth.js';
const clientId='123-fixture.apps.googleusercontent.com';
const payload={iss:'https://accounts.google.com',aud:clientId,exp:Date.now()/1000+3600,sub:'google-1',email:'student@college.edu.in',email_verified:true,nonce:'fixture-nonce'};
function account(overrides={}){return {id:'student-1',email:payload.email,google_subject_id:null,role:'student',account_status:'active',is_verified_student:false,roster_id:null,...overrides};}
function linkDb(user,conflicts=[]){const writes=[];return {writes,query:async(sql,args)=>{
 if(sql.startsWith('SELECT pg_advisory'))return {rows:[]};
 if(sql.startsWith('SELECT * FROM users WHERE id='))return {rows:[user]};
 if(sql.startsWith('SELECT id FROM users'))return {rows:conflicts};
 if(sql.startsWith('UPDATE users SET google_subject_id')){writes.push(sql);user.google_subject_id=args[0];return {rows:[{...user}]};}
 throw Error('Unexpected query '+sql);
}};}
test('Google claims reject unverified email, wrong issuer/audience, expired or missing subject',()=>{
 for(const change of [{email_verified:false},{iss:'https://evil.invalid'},{aud:'other'},{exp:0},{sub:''},{email:null}]){
  assert.throws(()=>validateGoogleClaims({...payload,...change},clientId),{status:401});
 }
 assert.equal(validateGoogleClaims(payload,clientId),payload);
});
test('Spoofed institutional email cannot be linked to unrelated personal Google account',async()=>{
 const u=account();const db=linkDb(u);
 await assert.rejects(()=>linkConfirmedGoogleAccount(db,u.id,{...payload,email:'unrelated@gmail.com'}),{status:409});
 assert.equal(db.writes.length,0);assert.equal(u.google_subject_id,null);assert.equal(u.is_verified_student,false);
});
test('Matching Google link preserves enrollment and does not replace an existing subject',async()=>{
 const u=account();const db=linkDb(u);const linked=await linkConfirmedGoogleAccount(db,u.id,payload);
 assert.equal(linked.google_subject_id,payload.sub);assert.equal(linked.is_verified_student,false);assert.equal(linked.roster_id,null);
 await assert.rejects(()=>linkConfirmedGoogleAccount(db,u.id,{...payload,sub:'replacement'}),{status:409});
 assert.equal(u.google_subject_id,payload.sub);
});
test('Duplicate Google subject or email binding rejects linking without reassignment',async()=>{
 const u=account();const db=linkDb(u,[{id:'other-student'}]);
 await assert.rejects(()=>linkConfirmedGoogleAccount(db,u.id,payload),{status:409});assert.equal(db.writes.length,0);
});
test('Linking preserves legitimate verified account status and roster',async()=>{
 const u=account({is_verified_student:true,roster_id:'roster-1'});const db=linkDb(u);
 const linked=await linkConfirmedGoogleAccount(db,u.id,payload);assert.equal(linked.is_verified_student,true);assert.equal(linked.roster_id,'roster-1');
});
test('Verification expiry fails closed at expiry, for missing expiry and invalid timestamps',()=>{
 for(const expiry of [undefined,null,'invalid',new Date(1000),new Date(999)])assert.throws(()=>requireCurrentClaim({expires_at:expiry},1000),{status:400});
 assert.doesNotThrow(()=>requireCurrentClaim({expires_at:new Date(1001)},1000));
});
test('Verification approvals require bounded official evidence and an independent method',()=>{
 for(const input of [{},{identityEvidenceReference:42},{identityEvidenceReference:'https://fake.invalid/id'},{identityEvidenceReference:'C:/private/id'},{identityEvidenceReference:String.raw`C:\private\id`},{identityEvidenceReference:'../id'},{identityEvidenceReference:'x'.repeat(501)},{identityEvidenceReference:'REG-12345',verificationMethod:'GOOGLE_SUBJECT_EXISTS'}])assert.throws(()=>requireVerificationEvidence(input),{status:422});
 assert.deepEqual(requireVerificationEvidence({identityEvidenceReference:'REGISTRAR-2026-19'}),{method:'OWNER_INDEPENDENT_ROSTER_VERIFICATION',evidence:'REGISTRAR-2026-19'});
});

// Full login function with injected Google verifier and isolated transaction double.
// No database connection, Google call, environment file, or real mail is used.
async function loginFixture({stored=account({google_subject_id:payload.sub}),claims=payload,rosters=[],duplicates=[],institutionSchema=true}={}){
 const keys=['APP_ORIGIN','DATABASE_URL','GOOGLE_CLIENT_ID','NODE_ENV','VERCEL'];const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 process.env.APP_ORIGIN='http://localhost:5173';process.env.DATABASE_URL='postgres://localhost/fictional';process.env.GOOGLE_CLIENT_ID=clientId;process.env.NODE_ENV='test';delete process.env.VERCEL;
 const writes=[];const calls=[];let state={...stored};
 const db={query:async(sql,args=[])=>{calls.push({sql,args});
  if(sql.startsWith('DELETE FROM auth_challenges'))return {rowCount:1,rows:[{}]};
  if(sql.startsWith('SELECT pg_advisory'))return {rows:[]};
  if(sql.startsWith('SELECT * FROM users WHERE google_subject_id'))return {rows:[state]};
  if(sql.startsWith('SELECT id FROM users'))return {rows:duplicates};
  if(sql.startsWith('UPDATE users SET email=')){state={...state,email:args[0],name:args[1]};return {rows:[state]};}
  if(sql.startsWith('SELECT to_regclass'))return {rows:[{available:institutionSchema}]};
  if(sql.includes('unnest(domains)'))return {rows:[{domain:'college.edu.in'}]};
  if(sql.startsWith('SELECT sr.*'))return {rows:rosters.map(r=>({...r,bound_user_id:state.roster_id===r.id?state.id:r.bound_user_id}))};
  if(sql.startsWith('UPDATE users SET is_verified_student')){state={...state,is_verified_student:true,roster_id:args[0]};writes.push(sql);return {rows:[state]};}
  if(sql.startsWith('UPDATE student_rosters') || sql.startsWith('INSERT INTO ')){writes.push(sql);return {rows:[],rowCount:1};}
  throw Error('Unexpected login query '+sql);
 }};
 try{const user=await login({headers:{cookie:'aegis_challenge=fixture-nonce'}},{setHeader(){}},'signed-fixture',{runTransaction:fn=>fn(db),verifyCredential:async()=>claims});return {user,writes,calls};}
 finally{for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
}
test('Fresh Google personal email cannot elevate an old self-declared institutional email',async()=>{
 const result=await loginFixture({claims:{...payload,email:'actual@gmail.com'}});
 assert.equal(result.user.email,'actual@gmail.com');assert.equal(result.user.is_verified_student,false);
 assert.equal(result.writes.some(q=>q.startsWith('UPDATE student_rosters')),false);
});
test('Fresh confirmed institutional Google email still verifies an authoritative exact roster',async()=>{
 const result=await loginFixture({rosters:[{id:'roster-1',institution_id:'institution-1',department_code:'CSE',dept_name:'Computer Science'}]});
 assert.equal(result.user.is_verified_student,true);assert.equal(result.user.roster_id,'roster-1');
 const lookup=result.calls.find(c=>c.sql.startsWith('SELECT sr.*'));assert.equal(lookup.args[0],payload.email);
 assert.equal(result.calls.find(c=>c.sql.startsWith('INSERT INTO student_verification_requests')).args[2],'institution-1');
 assert.match(lookup.sql,/JOIN institutions/);assert.match(lookup.sql,/i.active=true/);assert.match(lookup.sql,/FOR UPDATE OF sr/);
});
test('Ambiguous roster or duplicate email fails closed during Google login',async()=>{
 await assert.rejects(()=>loginFixture({rosters:[{id:'r1'},{id:'r2'}]}),{status:409});
 await assert.rejects(()=>loginFixture({duplicates:[{id:'another-user'}]}),{status:409});
});
test('Google login rejects nonce mismatch before touching account or roster',async()=>{
 await assert.rejects(()=>loginFixture({claims:{...payload,nonce:'different'}}),{status:401});
});

test('Fresh login cannot silently reassign an existing inconsistent roster binding',async()=>{
 const result=await loginFixture({stored:account({google_subject_id:payload.sub,roster_id:'existing-roster'}),rosters:[{id:'new-roster',department_code:'CSE'}]});
 assert.equal(result.user.roster_id,'existing-roster');assert.equal(result.user.is_verified_student,false);
 assert.equal(result.writes.some(sql=>sql.startsWith('UPDATE student_rosters')),false);
});

test('Pre-007 schema preserves Google sign-in without auto-verification or missing-table access',async()=>{
 const result=await loginFixture({institutionSchema:false});
 assert.equal(result.user.is_verified_student,false);assert.equal(result.calls.some(c=>c.sql.startsWith('SELECT sr.*')),false);
 assert.equal(result.writes.some(q=>q.startsWith('INSERT INTO sessions')),true);
});

test('Personal Gmail cannot auto-verify even when a roster and configured domain match',async()=>{
 const claims={...payload,email:'synthetic.personal@gmail.com'};
 const result=await loginFixture({claims,rosters:[{id:'roster-gmail',institution_id:'institution-1',department_code:'CSE'}]});
 assert.equal(result.user.is_verified_student,false);assert.equal(result.user.email,claims.email);
 assert.equal(result.writes.some(q=>q.startsWith('UPDATE student_rosters')),false);
});
