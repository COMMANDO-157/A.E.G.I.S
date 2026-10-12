// Explicit isolated-local opt-in: never load .env or use a remote database here.
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomBytes,randomInt,randomUUID} from 'node:crypto';
import {databaseOptions} from './server/config.js';
import {hashActionPin,computeTotp} from './server/crypto.js';
import {digest,issueStepUpToken,verifyStepUpToken} from './server/auth.js';
import {beginOwnerEntry,finishOwnerEntry,requireOwnerGrant} from './server/owner-portal.js';
import {consumeRateLimit} from './server/rate-limit.js';
import {createHandler} from './server/handler.js';

function localOptions(key) {
 let url;try{url=new URL(process.env[key]);}catch{throw new Error('Isolated local test connection required.');}
 if(process.env.AEGIS_ISOLATED_TESTS!=='true'||!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/isolated_aegis_[a-z0-9_]+$/.test(url.pathname)) throw new Error('Refusing non-isolated Owner database test.');
 return {...databaseOptions({...process.env,DATABASE_URL:url.toString()}),max:5};
}

test('Owner portal SQL, real concurrent consumption, runtime MFA enrollment and session revocation',async()=>{
 const runtime=new pg.Pool(localOptions('DATABASE_URL')),operator=new pg.Pool(localOptions('MIGRATION_DATABASE_URL'));
 let checks=0;
 const check=async(name,fn)=>{await fn();checks++;console.log('PASS: '+name);};
 const transaction=async fn=>{const client=await runtime.connect();try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}};
 try{
  const id=randomUUID(),session=digest(randomBytes(32).toString('base64url'));
  const pin=String(randomInt(100000)).padStart(5,'0');const {pinHash,pinSalt}=hashActionPin(pin);
  const email='synthetic.owner.'+id+'@example.test';
  process.env.PRIMARY_OWNER_USER_ID=id;process.env.PRIMARY_OWNER_EMAIL=email;process.env.OWNER_OTP_HMAC_KEY=randomBytes(32).toString('hex');
  await operator.query("INSERT INTO users(id,google_subject_id,email,name,role,is_primary_owner,mfa_enrolled,action_pin_hash,action_pin_salt,action_pin_set_at) VALUES($1,$2,$3,'Synthetic isolated Owner','admin',true,true,$4,$5,now())",[id,'synthetic:'+id,email,pinHash,pinSalt]);
  // A non-null encrypted secret prerequisite; enrollment below creates the real one.
  await operator.query('UPDATE users SET mfa_secret_encrypted=$1 WHERE id=$2',['synthetic-pre-enrollment',id]);
  await operator.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[session,id]);
  const user=async()=>({...((await runtime.query('SELECT * FROM users WHERE id=$1',[id])).rows[0]),session_hash:session});
  let delivery;
  const deps={db:runtime,transaction,limit:(...args)=>consumeRateLimit(runtime,...args),deliver:async d=>{delivery=d;}};
  let challenge,grant;
  await check('Existing runtime role has reset-token DML and no TRUNCATE',async()=>{
   const r=(await runtime.query("SELECT current_user role,has_table_privilege(current_user,'password_reset_tokens','SELECT,INSERT,UPDATE,DELETE') dml,has_table_privilege(current_user,'password_reset_tokens','TRUNCATE') truncate")).rows[0];
   assert.equal(r.role,'aegis_app_runtime');assert.equal(r.dml,true);assert.equal(r.truncate,false);
  });
  await check('PIN entry stores a keyed OTP hash and sends only to designated synthetic email',async()=>{
   challenge=await beginOwnerEntry(await user(),{pin},deps);
   assert.equal(delivery.email,email);
   const row=(await runtime.query('SELECT otp_hash FROM owner_entry_challenges WHERE id=$1',[challenge.challengeId])).rows[0];
   assert.notEqual(row.otp_hash,delivery.code);assert.match(row.otp_hash,/^[0-9a-f]{64}$/);
  });
  await check('Concurrent verification on real connections grants access exactly once',async()=>{
   const u=await user(),input={challengeId:challenge.challengeId,otp:delivery.code};
   const results=await Promise.allSettled([finishOwnerEntry(u,input,deps),finishOwnerEntry(u,input,deps)]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);grant=results.find(r=>r.status==='fulfilled').value.grant;
   await requireOwnerGrant({headers:{'x-aegis-owner-grant':grant}},await user(),runtime);
  });
  await check('Grant from another login session is rejected',async()=>{
   await assert.rejects(requireOwnerGrant({headers:{'x-aegis-owner-grant':grant}},{...await user(),session_hash:digest('another-session')},runtime),{status:403});
  });
  await check('Legacy unbound step-up cannot authorize a current session',async()=>{
   const token=await issueStepUpToken(id,'admin_step_up',runtime);
   assert.equal(await verifyStepUpToken(id,'admin_step_up',token,runtime,session),false);
  });
  await check('Bound action step-up remains single use',async()=>{
   const token=await issueStepUpToken(id,'admin_step_up',runtime,session);
   assert.equal(await verifyStepUpToken(id,'admin_step_up',token,runtime,session),true);
   assert.equal(await verifyStepUpToken(id,'admin_step_up',token,runtime,session),false);
  });
  await check('Five PIN failures persist lockout across database connections',async()=>{
   await operator.query('UPDATE users SET owner_failed_attempts=0,owner_locked_until=NULL,action_pin_failed_attempts=0,action_pin_locked_until=NULL WHERE id=$1',[id]);
   await operator.query('DELETE FROM rate_limits');
   const wrong=pin==='00000'?'11111':'00000';
   for(let i=0;i<5;i++)await assert.rejects(beginOwnerEntry(await user(),{pin:wrong},deps),{status:403});
   const locked=(await operator.query('SELECT owner_locked_until>now() locked,action_pin_locked_until>now() pin_locked FROM users WHERE id=$1',[id])).rows[0];
   assert.equal(locked.locked,true);assert.equal(locked.pin_locked,true);
   await assert.rejects(requireOwnerGrant({headers:{'x-aegis-owner-grant':grant}},await user(),runtime),{status:403});
  });
  // Reset only this disposable synthetic fixture for enrollment scenarios.
  await operator.query('UPDATE users SET owner_failed_attempts=0,owner_locked_until=NULL,action_pin_failed_attempts=0,action_pin_locked_until=NULL,mfa_enrolled=false WHERE id=$1',[id]);
  await operator.query('DELETE FROM rate_limits');
  const oldHash=digest(randomBytes(16));
  await operator.query('INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES($1,$2)',[id,oldHash]);
  const handler=createHandler({sessionUser:user,logout:async()=>{}},{database:()=>runtime,transaction});
  const call=async(path,input)=>{let payload;const res={statusCode:0,setHeader(){},end(body){payload=JSON.parse(body);}};await handler({method:'POST',url:'/api/'+path,headers:{origin:process.env.APP_ORIGIN,'content-type':'application/json'},body:input},res);assert.equal(res.statusCode,200);return payload;};
  let mfa;
  await check('Real runtime MFA setup revokes old codes without forbidden DELETE',async()=>{
   assert.equal((await runtime.query("SELECT has_table_privilege(current_user,'mfa_recovery_codes','DELETE') permitted")).rows[0].permitted,false);
   mfa=await call('admin/mfa/setup',{});
   assert.equal((await runtime.query('SELECT used FROM mfa_recovery_codes WHERE user_id=$1 AND code_hash=$2',[id,oldHash])).rows[0].used,true);
   assert.equal(mfa.recoveryCodes.length,8);
  });
  await check('Authenticator confirmation issues a real session-bound token',async()=>{
   const confirmed=await call('admin/mfa/verify',{code:computeTotp(mfa.secret)});
   assert.equal(await verifyStepUpToken(id,'mfa_step_up',confirmed.stepUpToken,runtime,session),true);
  });
  await check('Owner-controlled first PIN enrollment requires email OTP and enrolled TOTP',async()=>{
   await operator.query('UPDATE users SET action_pin_hash=NULL,action_pin_salt=NULL,action_pin_set_at=NULL WHERE id=$1',[id]);
   const c=await beginOwnerEntry(await user(),{},deps);assert.equal(c.setup,true);
   const chosen=String(randomInt(100000)).padStart(5,'0');
   const entered=await finishOwnerEntry(await user(),{challengeId:c.challengeId,otp:delivery.code,pin:chosen,totp:computeTotp(mfa.secret)},deps);
   await requireOwnerGrant({headers:{'x-aegis-owner-grant':entered.grant}},await user(),runtime);
  });
  await check('Deleting a login session revokes all associated Owner entry state',async()=>{
   await runtime.query('DELETE FROM sessions WHERE token_hash=$1',[session]);
   for(const table of ['owner_entry_challenges','owner_portal_grants'])assert.equal((await runtime.query('SELECT count(*)::int n FROM '+table+' WHERE user_id=$1',[id])).rows[0].n,0);
  });
  console.log('OWNER POSTGRESQL SUMMARY: '+checks+' passed, 0 failed. Synthetic local accounts only; email provider mocked.');
 }finally{await runtime.end();await operator.end();}
});
