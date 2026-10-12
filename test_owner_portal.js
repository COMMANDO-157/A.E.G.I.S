import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {beginOwnerEntry,finishOwnerEntry,requireOwnerGrant,designatedOwner} from './server/owner-portal.js';
import {sendOwnerOtp,checkOwnerEmailProvider} from './server/owner-email.js';
import {hashActionPin,encryptSecret,generateTotpSecret,computeTotp} from './server/crypto.js';
import {digest} from './server/auth.js';
import {createHandler} from './server/handler.js';
import {migrationBody} from './scripts/migration-sql.js';
import {ownerDesignationPlan} from './server/owner-designation.js';

const ownerId='00000000-0000-0000-0000-000000000001';
process.env.PRIMARY_OWNER_USER_ID=ownerId;
process.env.PRIMARY_OWNER_EMAIL='owner@campus.test';
process.env.OWNER_OTP_HMAC_KEY=randomBytes(32).toString('hex');
process.env.NODE_ENV='test';
process.env.DATABASE_URL='postgres://localhost/fictional';
function fixture(setup=false) {
 const {pinHash,pinSalt}=hashActionPin('54321');
 const secret=generateTotpSecret();
 const user={id:ownerId,email:'owner@campus.test',role:'admin',account_status:'active',is_primary_owner:true,
  session_hash:digest('s'.repeat(43)),mfa_enrolled:true,mfa_secret_encrypted:encryptSecret(secret),
  action_pin_hash:setup?null:pinHash,action_pin_salt:setup?null:pinSalt,action_pin_set_at:setup?null:new Date(),
  action_pin_failed_attempts:0,owner_failed_attempts:0};
 let challenge=null,grant=null,delivery=null,tail=Promise.resolve();
 const queries=[],rates=[];
 const db={query:async(sql,v=[])=>{
  queries.push(sql);
  if(sql.startsWith('SELECT * FROM users')) return {rows:[user],rowCount:1};
  if(sql.startsWith('INSERT INTO owner_entry_challenges')) {
   challenge={id:v[0],user_id:v[1],session_hash:v[2],otp_hash:v[3],setup:v[4],pin_set_at:v[5],used:false,delivered:false,expires_at:new Date(Date.now()+300000)};
  } else if(sql.startsWith('UPDATE owner_entry_challenges SET delivered')) {
   if(!challenge||challenge.id!==v[0]) return {rows:[],rowCount:0};
   challenge.delivered=true;return {rows:[{id:challenge.id}],rowCount:1};
  } else if(sql.startsWith('SELECT * FROM owner_entry_challenges')) {
   return {rows:challenge&&challenge.id===v[0]&&challenge.user_id===v[1]&&challenge.session_hash===v[2]&&!challenge.used&&challenge.delivered&&challenge.expires_at>Date.now()?[challenge]:[]};
  } else if(sql.startsWith('UPDATE owner_entry_challenges SET used')) challenge.used=true;
  else if(sql.startsWith('UPDATE users SET owner_failed_attempts=owner_failed_attempts+1')) {
   user.owner_failed_attempts++; if(user.owner_failed_attempts>=5)user.owner_locked_until=new Date(Date.now()+900000);
  } else if(sql.startsWith('UPDATE users SET action_pin_failed_attempts=action_pin_failed_attempts+1')) {
   user.action_pin_failed_attempts++;if(user.action_pin_failed_attempts>=5)user.action_pin_locked_until=new Date(Date.now()+900000);
  } else if(sql.startsWith('UPDATE users SET owner_failed_attempts=0')) {user.owner_failed_attempts=0;user.owner_locked_until=null;}
  else if(sql.startsWith('UPDATE users SET action_pin_hash')) {user.action_pin_hash=v[0];user.action_pin_salt=v[1];user.action_pin_set_at=new Date();}
  else if(sql.startsWith('INSERT INTO owner_portal_grants')) grant={token_hash:v[0],user_id:v[2],session_hash:v[1],pin_set_at:user.action_pin_set_at,expires_at:new Date(Date.now()+600000)};
  else if(sql.startsWith('DELETE FROM owner_portal_grants')) grant=null;
  else if(sql.startsWith('SELECT g.token_hash FROM owner_portal_grants')) {
   const valid=grant&&grant.token_hash===v[0]&&grant.user_id===v[1]&&grant.session_hash===v[2]&&grant.expires_at>Date.now()&&grant.pin_set_at===user.action_pin_set_at&&user.mfa_enrolled&&!user.owner_locked_until&&!user.action_pin_locked_until;
   return {rowCount:valid?1:0,rows:valid?[grant]:[]};
  }
  return {rows:[],rowCount:1};
 }};
 const deps={db,transaction:fn=>{const p=tail.then(()=>fn(db));tail=p.catch(()=>{});return p;},
  limit:async(...args)=>rates.push(args),deliver:async d=>{delivery=d;}};
 return {user,secret,db,deps,queries,rates,get challenge(){return challenge;},get delivery(){return delivery;},get grant(){return grant;}};
}
const request=grant=>({headers:{'x-aegis-owner-grant':grant}});
async function enter(f) {
 const c=await beginOwnerEntry(f.user,{pin:'54321'},f.deps);
 return finishOwnerEntry(f.user,{challengeId:c.challengeId,otp:f.delivery.code},f.deps);
}

test('Owner entry requires designation and gives the same denial for other authenticated accounts',()=>{
 const f=fixture();
 for(const u of [{...f.user,role:'student'},{...f.user,is_primary_owner:false},{...f.user,id:'other'},{...f.user,email:'other@campus.test'}])
  assert.throws(()=>designatedOwner(u),{status:403,message:'Owner access unavailable.'});
});
test('Designation preparation matches exact identity and cannot create or replace an owner',()=>{
 const candidate={...fixture().user,google_subject_id:'100000001'};
 const identity={userId:candidate.id,email:candidate.email,googleSubject:candidate.google_subject_id};
 assert.equal(ownerDesignationPlan(candidate,[],identity).approvalRequired,true);
 assert.throws(()=>ownerDesignationPlan(candidate,[],{...identity,email:'other@example.test'}),{status:403});
 assert.throws(()=>ownerDesignationPlan(candidate,[],{...identity,googleSubject:'other'}),{status:403});
 assert.throws(()=>ownerDesignationPlan({...candidate,account_status:'suspended'},[],identity),{status:403});
 assert.throws(()=>ownerDesignationPlan(candidate,[{id:'different-owner'}],identity),{status:409});
 assert.throws(()=>ownerDesignationPlan(candidate,[],{}),{status:422});
 assert.equal(candidate.is_primary_owner,true);
});
test('PIN precedes fresh email proof; no OTP appears in the response or database',async()=>{
 const f=fixture();
 await assert.rejects(beginOwnerEntry(f.user,{pin:'00000'},f.deps),{status:403});
 assert.equal(f.delivery,null);assert.equal(f.user.action_pin_failed_attempts,1);
 const response=await beginOwnerEntry(f.user,{pin:'54321'},f.deps);
 assert.deepEqual(Object.keys(response).sort(),['challengeId','setup']);
 assert.match(f.delivery.code,/^\d{6}$/);assert.notEqual(f.challenge.otp_hash,f.delivery.code);
 assert.ok(f.rates.some(r=>r[1]===5&&r[2]===900));
});
test('Five PIN failures lock the account across challenges and sessions',async()=>{
 const f=fixture();
 for(let i=0;i<5;i++) await assert.rejects(beginOwnerEntry(f.user,{pin:'00000'},f.deps),{status:403});
 await assert.rejects(beginOwnerEntry({...f.user,session_hash:'other'},{pin:'54321'},f.deps),{status:403});
 assert.equal(f.delivery,null);assert.ok(f.user.action_pin_locked_until);assert.ok(f.user.owner_locked_until);
});
test('OTP consumption is atomic: concurrent verification and replay cannot issue a second grant',async()=>{
 const f=fixture(),c=await beginOwnerEntry(f.user,{pin:'54321'},f.deps);
 const payload={challengeId:c.challengeId,otp:f.delivery.code};
 const results=await Promise.allSettled([finishOwnerEntry(f.user,payload,f.deps),finishOwnerEntry(f.user,payload,f.deps)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(f.challenge.used,true);
 await assert.rejects(finishOwnerEntry(f.user,payload,f.deps),{status:403});
});
test('OTP fails for wrong session, expiration, and a superseded challenge',async()=>{
 const f=fixture(),c=await beginOwnerEntry(f.user,{pin:'54321'},f.deps);
 const payload={challengeId:c.challengeId,otp:f.delivery.code};
 await assert.rejects(finishOwnerEntry({...f.user,session_hash:'other'},payload,f.deps),{status:403});
 f.challenge.expires_at=new Date(0);
 await assert.rejects(finishOwnerEntry(f.user,payload,f.deps),{status:403});
 await beginOwnerEntry(f.user,{pin:'54321'},f.deps);
 await assert.rejects(finishOwnerEntry(f.user,payload,f.deps),{status:403});
});
test('Five bad OTPs lock verification; a newly sent code cannot reset the guessing budget',async()=>{
 const f=fixture(),c=await beginOwnerEntry(f.user,{pin:'54321'},f.deps);
 const wrong=f.delivery.code==='000000'?'111111':'000000';
 for(let i=0;i<5;i++) await assert.rejects(finishOwnerEntry(f.user,{challengeId:c.challengeId,otp:wrong},f.deps),{status:403});
 await assert.rejects(beginOwnerEntry(f.user,{pin:'54321'},f.deps),{status:403});
 await assert.rejects(finishOwnerEntry(f.user,{challengeId:c.challengeId,otp:f.delivery.code},f.deps),{status:403});
});
test('PIN change after the email request invalidates that challenge',async()=>{
 const f=fixture(),c=await beginOwnerEntry(f.user,{pin:'54321'},f.deps);
 f.user.action_pin_set_at=new Date(Date.now()+1000);
 await assert.rejects(finishOwnerEntry(f.user,{challengeId:c.challengeId,otp:f.delivery.code},f.deps),{status:403});
 assert.equal(f.grant,null);
});
test('First PIN setup requires emailed proof and existing authenticator; owner status cannot be created',async()=>{
 const f=fixture(true),c=await beginOwnerEntry(f.user,{},f.deps);
 assert.equal(c.setup,true);
 await assert.rejects(finishOwnerEntry(f.user,{challengeId:c.challengeId,otp:f.delivery.code,pin:'12345',totp:'invalid'},f.deps),{status:403});
 assert.equal(f.user.action_pin_hash,null);
 const result=await finishOwnerEntry(f.user,{challengeId:c.challengeId,otp:f.delivery.code,pin:'12345',totp:computeTotp(f.secret)},f.deps);
 assert.match(result.grant,/^[A-Za-z0-9_-]{43}$/);assert.ok(f.user.action_pin_hash);
 assert.equal(f.user.is_primary_owner,true);
});
test('Grant is bound to session, current PIN, MFA, expiry and revoked on every new entry',async()=>{
 const f=fixture(),result=await enter(f);
 await requireOwnerGrant(request(result.grant),f.user,f.db);
 await assert.rejects(requireOwnerGrant(request(result.grant),{...f.user,session_hash:'other'},f.db),{status:403});
 f.grant.expires_at=new Date(0);
 await assert.rejects(requireOwnerGrant(request(result.grant),f.user,f.db),{status:403});
 const fresh=await enter(f);
 f.user.action_pin_set_at=new Date();
 await assert.rejects(requireOwnerGrant(request(fresh.grant),f.user,f.db),{status:403});
 await beginOwnerEntry(f.user,{pin:'54321'},f.deps);
 assert.equal(f.grant,null);
});
test('Email delivery failure cannot leave a usable OTP',async()=>{
 const f=fixture();f.deps.deliver=async()=>{throw Object.assign(new Error('Unavailable'),{status:503});};
 await assert.rejects(beginOwnerEntry(f.user,{pin:'54321'},f.deps),{status:503});
 assert.equal(f.challenge.delivered,false);assert.equal(f.grant,null);
});
test('Resend domain must be verified and match the configured sender before email submission',async()=>{
 process.env.RESEND_API_KEY='test-only';process.env.OWNER_EMAIL_FROM='security@campus.test';process.env.OWNER_EMAIL_DOMAIN_ID='test-domain';
 for(const domain of [{name:'campus.test',status:'pending'},{name:'other.test',status:'verified'}]) {
  let calls=0;
  await assert.rejects(sendOwnerOtp({email:'owner@campus.test',code:'123456',challengeId:'test'},async()=>{calls++;return {ok:true,json:async()=>domain};}),{status:503});
  assert.equal(calls,1);
 }
 const calls=[];
 await sendOwnerOtp({email:'owner@campus.test',code:'123456',challengeId:'test'},async(url,options)=>{
  calls.push({url,options});return {ok:true,json:async()=>url.includes('/domains/')?{name:'campus.test',status:'verified'}:{id:'message-id'}};
 });
 assert.equal(calls.length,2);assert.deepEqual(JSON.parse(calls[1].options.body).to,['owner@campus.test']);
 const readOnlyCalls=[];
 const preflight=await checkOwnerEmailProvider(async(url,options)=>{
  readOnlyCalls.push({url,options});return {ok:true,json:async()=>({name:'campus.test',status:'verified'})};
 });
 assert.equal(preflight.emailSent,false);assert.equal(readOnlyCalls.length,1);
 assert.ok(readOnlyCalls[0].url.includes('/domains/'));assert.equal(readOnlyCalls[0].options.method,undefined);
});
test('Direct owner/admin API requests cannot bypass entry, change the PIN, or replace enrolled MFA',async()=>{
 const f=fixture();const server=http.createServer(createHandler({sessionUser:async()=>f.user,logout:async()=>{}},{database:()=>f.db,transaction:f.deps.transaction},{consumeRateLimit:async()=>({})}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;process.env.APP_ORIGIN=origin;
 const post=(path,body,grant)=>fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(grant?{'X-Aegis-Owner-Grant':grant}:{})},body:JSON.stringify(body)});
 try {
  for(const path of ['/api/admin/users','/api/admin/audit','/api/admin/departments','/api/complaints']) assert.equal((await fetch(origin+path)).status,403);
  assert.equal((await post('/api/admin/pin/setup',{pin:'12345'})).status,403);
  assert.equal((await post('/api/owner/entry/start',{email:'other@campus.test',pin:'54321'})).status,422);
  const granted=await enter(f);
  assert.equal((await post('/api/admin/pin/setup',{pin:'12345'},granted.grant)).status,403);
  assert.equal((await post('/api/admin/mfa/setup',{},granted.grant)).status,403);
  const cross=await fetch(origin+'/api/owner/entry/start',{method:'POST',headers:{Origin:'https://attacker.test','Content-Type':'application/json'},body:'{}'});
  assert.equal(cross.status,403);
 } finally {await new Promise(resolve=>server.close(resolve));}
});
test('Migration transaction wrappers are removed even after leading comments; checksums stay outside file commits',async()=>{
 for(const name of ['001_stage3.sql','002_security.sql','003_auth_v4_2.sql','004_institutional_roster.sql','005_password_auth.sql','006_owner_portal.sql']) {
  const raw=await readFile(new URL('./migrations/'+name,import.meta.url),'utf8');
  const body=migrationBody(raw);
  assert.doesNotMatch(body,/^\s*(BEGIN|COMMIT);\s*$/mi);
  assert.ok(body.includes('CREATE'));
 }
});
