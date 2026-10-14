import {randomInt,randomUUID,randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {digest} from './auth.js';
import {fail,active} from './policy.js';
import {verifyActionPin,hashActionPin,verifyTotp,decryptSecret} from './crypto.js';
import {sendOwnerOtp} from './owner-email.js';

const denied=()=>fail(403,'Owner access unavailable.');
export function designatedOwner(user) {
 active(user);
 const {PRIMARY_OWNER_USER_ID:id,PRIMARY_OWNER_EMAIL:email}=process.env;
 if(!id || !email) fail(503,'Owner verification unavailable.');
 if(user.role!=='admin' || !user.is_primary_owner || user.id!==id || user.email?.toLowerCase()!==email.toLowerCase() || !user.session_hash) denied();
}
function otpHash(id,user,code) {
 const key=process.env.OWNER_OTP_HMAC_KEY;
 if(!/^[a-fA-F0-9]{64}$/.test(key||'')) fail(503,'Owner verification unavailable.');
 return createHmac('sha256',Buffer.from(key,'hex')).update(JSON.stringify([id,user.id,user.session_hash,code])).digest('hex');
}
const locked=u=>[u.owner_locked_until,u.action_pin_locked_until].some(t=>t&&new Date(t).getTime()>Date.now());
async function failure(db,u,pin=false) {
 await db.query(`UPDATE users SET owner_failed_attempts=owner_failed_attempts+1,
 owner_locked_until=CASE WHEN owner_failed_attempts+1>=5 THEN now()+interval '15 minutes' ELSE owner_locked_until END
 WHERE id=$1`,[u.id]);
 if(pin) await db.query(`UPDATE users SET action_pin_failed_attempts=action_pin_failed_attempts+1,
 action_pin_locked_until=CASE WHEN action_pin_failed_attempts+1>=5 THEN now()+interval '15 minutes' ELSE action_pin_locked_until END WHERE id=$1`,[u.id]);
}
export async function requireOwnerGrant(req,user,db) {
 designatedOwner(user);
 const token=req.headers['x-aegis-owner-grant'];
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)) denied();
 const result=await db.query(`SELECT g.token_hash FROM owner_portal_grants g JOIN users u ON u.id=g.user_id
 JOIN sessions s ON s.token_hash=g.session_hash WHERE g.token_hash=$1 AND g.user_id=$2 AND g.session_hash=$3
 AND g.expires_at>now() AND s.expires_at>now() AND g.pin_set_at=u.action_pin_set_at
 AND u.mfa_enrolled=true AND (u.owner_locked_until IS NULL OR u.owner_locked_until<=now())
 AND (u.action_pin_locked_until IS NULL OR u.action_pin_locked_until<=now())`,[digest(token),user.id,user.session_hash]);
 if(!result.rowCount) denied();
}
export async function beginOwnerEntry(user,input,{transaction,db,limit,deliver=sendOwnerOtp}) {
 designatedOwner(user);
 await limit('owner:entry:'+user.id,5,900);
 const id=randomUUID(),code=String(randomInt(0,1000000)).padStart(6,'0');
 const hash=otpHash(id,user,code);
 const result=await transaction(async tx=>{
  const u=(await tx.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[user.id])).rows[0];
  designatedOwner({...u,session_hash:user.session_hash});
  if(locked(u)) return {denied:true};
  const setup=!u.action_pin_hash;
  if(!setup && (typeof input.pin!=='string'||!/^\d{5}$/.test(input.pin)||!verifyActionPin(input.pin,u.action_pin_hash,u.action_pin_salt))) {
   await failure(tx,u,true); return {denied:true};
  }
  // New entry invalidates all prior entry codes and grants for this login session.
  await tx.query('DELETE FROM owner_portal_grants WHERE user_id=$1 AND session_hash=$2',[user.id,user.session_hash]);
  await tx.query(`INSERT INTO owner_entry_challenges(id,user_id,session_hash,otp_hash,setup,pin_set_at,expires_at)
  VALUES($1,$2,$3,$4,$5,$6,now()+interval '5 minutes') ON CONFLICT(user_id,session_hash) DO UPDATE SET
  id=EXCLUDED.id,otp_hash=EXCLUDED.otp_hash,setup=EXCLUDED.setup,pin_set_at=EXCLUDED.pin_set_at,expires_at=EXCLUDED.expires_at,used=false,delivered=false`,[id,user.id,user.session_hash,hash,setup,u.action_pin_set_at||null]);
  return {setup};
 });
 if(result.denied) denied();
 // A provider failure leaves no usable challenge; codes are never returned or logged.
 await deliver({email:process.env.PRIMARY_OWNER_EMAIL,code,challengeId:id});
 const delivered=await db.query('UPDATE owner_entry_challenges SET delivered=true WHERE id=$1 AND user_id=$2 AND session_hash=$3 AND used=false AND expires_at>now() RETURNING id',[id,user.id,user.session_hash]);
 if(!delivered.rowCount) denied();
 return {challengeId:id,setup:result.setup};
}
export async function finishOwnerEntry(user,input,{transaction,limit}) {
 designatedOwner(user);
 await limit('owner:verify:'+user.id,10,900);
 if(typeof input.challengeId!=='string'||!/^[0-9a-f-]{36}$/.test(input.challengeId)) denied();
 const hash=otpHash(input.challengeId,user,typeof input.otp==='string'?input.otp:'');
 const token=randomBytes(32).toString('base64url');
 const result=await transaction(async tx=>{
  const u=(await tx.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[user.id])).rows[0];
  designatedOwner({...u,session_hash:user.session_hash});
  if(locked(u)) return false;
  const c=(await tx.query(`SELECT * FROM owner_entry_challenges WHERE id=$1 AND user_id=$2 AND session_hash=$3
  AND used=false AND delivered=true AND expires_at>now() FOR UPDATE`,[input.challengeId,user.id,user.session_hash])).rows[0];
  if(!c || typeof input.otp!=='string'||!/^\d{6}$/.test(input.otp)||!timingSafeEqual(Buffer.from(c.otp_hash,'hex'),Buffer.from(hash,'hex'))) {
   await failure(tx,u); return false;
  }
  if(!u.mfa_enrolled || !u.mfa_secret_encrypted) return false;
  if(!c.setup && new Date(c.pin_set_at).getTime()!==new Date(u.action_pin_set_at).getTime()) return false;
  if(c.setup) {
   // First PIN: emailed proof plus existing authenticator. No public owner designation.
   if(u.action_pin_hash || typeof input.pin!=='string'||!/^\d{5}$/.test(input.pin)||!verifyTotp(input.totp,decryptSecret(u.mfa_secret_encrypted))) {
    await failure(tx,u);return false;
   }
   const {pinHash,pinSalt}=hashActionPin(input.pin);
   await tx.query('UPDATE users SET action_pin_hash=$1,action_pin_salt=$2,action_pin_set_at=now() WHERE id=$3',[pinHash,pinSalt,user.id]);
  }
  await tx.query('UPDATE owner_entry_challenges SET used=true WHERE id=$1',[c.id]);
  await tx.query('UPDATE users SET owner_failed_attempts=0,owner_locked_until=NULL WHERE id=$1',[user.id]);
  await tx.query(`INSERT INTO owner_portal_grants(token_hash,user_id,session_hash,pin_set_at,expires_at)
  SELECT $1,id,$2,action_pin_set_at,now()+interval '10 minutes' FROM users WHERE id=$3
  ON CONFLICT(user_id,session_hash) DO UPDATE SET token_hash=EXCLUDED.token_hash,pin_set_at=EXCLUDED.pin_set_at,expires_at=EXCLUDED.expires_at`,[digest(token),user.session_hash,user.id]);
  await tx.query("INSERT INTO audit_logs(actor_id,action,details) VALUES($1,'OWNER_PORTAL_ENTRY',$2)",[user.id,JSON.stringify({setup:c.setup})]);
  return true;
 });
 if(!result) denied();
 return {grant:token,expiresIn:600};
}

export async function setupOwnerPin(user,input,{transaction,limit}) {
 designatedOwner(user);
 await limit('owner:pin:setup:'+user.id,5,900);
 if(typeof input.pin!=='string'||!/^\d{5}$/.test(input.pin)||typeof input.totp!=='string'||!/^\d{6}$/.test(input.totp)) denied();
 const token=randomBytes(32).toString('base64url');
 const result=await transaction(async tx=>{
  const u=(await tx.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[user.id])).rows[0];
  designatedOwner({...u,session_hash:user.session_hash});
  if(locked(u)) return false;
  if(u.action_pin_hash || !u.mfa_enrolled || !u.mfa_secret_encrypted) return false;
  if(!verifyTotp(input.totp,decryptSecret(u.mfa_secret_encrypted))) {
   await failure(tx,u);return false;
  }
  const {pinHash,pinSalt}=hashActionPin(input.pin);
  await tx.query('UPDATE users SET action_pin_hash=$1,action_pin_salt=$2,action_pin_set_at=now(),owner_failed_attempts=0,owner_locked_until=NULL,action_pin_failed_attempts=0,action_pin_locked_until=NULL WHERE id=$3',[pinHash,pinSalt,user.id]);
  await tx.query('DELETE FROM owner_portal_grants WHERE user_id=$1',[user.id]);
  await tx.query(`INSERT INTO owner_portal_grants(token_hash,user_id,session_hash,pin_set_at,expires_at)
  SELECT $1,id,$2,action_pin_set_at,now()+interval '10 minutes' FROM users WHERE id=$3
  ON CONFLICT(user_id,session_hash) DO UPDATE SET token_hash=EXCLUDED.token_hash,pin_set_at=EXCLUDED.pin_set_at,expires_at=EXCLUDED.expires_at`,[digest(token),user.session_hash,user.id]);
  await tx.query("INSERT INTO audit_logs(actor_id,action,details) VALUES($1,'OWNER_PIN_ENROLLED',$2)",[user.id,JSON.stringify({method:'totp_reauth'})]);
  return true;
 });
 if(!result) denied();
 return {grant:token,expiresIn:600};
}

export async function entryOwnerTotp(user,input,{transaction,limit}) {
 designatedOwner(user);
 await limit('owner:entry:totp:'+user.id,5,900);
 if(typeof input.pin!=='string'||!/^\d{5}$/.test(input.pin)||typeof input.totp!=='string'||!/^\d{6}$/.test(input.totp)) denied();
 const token=randomBytes(32).toString('base64url');
 const result=await transaction(async tx=>{
  const u=(await tx.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[user.id])).rows[0];
  designatedOwner({...u,session_hash:user.session_hash});
  if(locked(u)) return false;
  if(!u.action_pin_hash || !u.mfa_enrolled || !u.mfa_secret_encrypted) return false;
  if(!verifyTotp(input.totp,decryptSecret(u.mfa_secret_encrypted))) {
   await failure(tx,u);return false;
  }
  if(!verifyActionPin(input.pin,u.action_pin_hash,u.action_pin_salt)) {
   await failure(tx,u,true);return false;
  }
  await tx.query('DELETE FROM owner_portal_grants WHERE user_id=$1',[user.id]);
  await tx.query('UPDATE users SET owner_failed_attempts=0,owner_locked_until=NULL,action_pin_failed_attempts=0,action_pin_locked_until=NULL WHERE id=$1',[user.id]);
  await tx.query(`INSERT INTO owner_portal_grants(token_hash,user_id,session_hash,pin_set_at,expires_at)
  SELECT $1,id,$2,action_pin_set_at,now()+interval '10 minutes' FROM users WHERE id=$3
  ON CONFLICT(user_id,session_hash) DO UPDATE SET token_hash=EXCLUDED.token_hash,pin_set_at=EXCLUDED.pin_set_at,expires_at=EXCLUDED.expires_at`,[digest(token),user.session_hash,user.id]);
  await tx.query("INSERT INTO audit_logs(actor_id,action,details) VALUES($1,'OWNER_PORTAL_ENTRY',$2)",[user.id,JSON.stringify({method:'pin_plus_totp'})]);
  return true;
 });
 if(!result) denied();
 return {grant:token,expiresIn:600};
}

export async function changeOwnerPin(user,input,{transaction,limit}) {
 designatedOwner(user);
 await limit('owner:pin:change:'+user.id,5,900);
 if(typeof input.currentPin!=='string'||!/^\d{5}$/.test(input.currentPin)) denied();
 if(typeof input.newPin!=='string'||!/^\d{5}$/.test(input.newPin)) denied();
 if(typeof input.totp!=='string'||!/^\d{6}$/.test(input.totp)) denied();
 const token=randomBytes(32).toString('base64url');
 const result=await transaction(async tx=>{
  const u=(await tx.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[user.id])).rows[0];
  designatedOwner({...u,session_hash:user.session_hash});
  if(locked(u)) return false;
  if(!u.action_pin_hash || !u.mfa_enrolled || !u.mfa_secret_encrypted) return false;
  if(!verifyTotp(input.totp,decryptSecret(u.mfa_secret_encrypted))) {
   await failure(tx,u);return false;
  }
  if(!verifyActionPin(input.currentPin,u.action_pin_hash,u.action_pin_salt)) {
   await failure(tx,u,true);return false;
  }
  const {pinHash,pinSalt}=hashActionPin(input.newPin);
  await tx.query('UPDATE users SET action_pin_hash=$1,action_pin_salt=$2,action_pin_set_at=now(),owner_failed_attempts=0,owner_locked_until=NULL,action_pin_failed_attempts=0,action_pin_locked_until=NULL WHERE id=$3',[pinHash,pinSalt,user.id]);
  await tx.query('DELETE FROM owner_portal_grants WHERE user_id=$1',[user.id]);
  await tx.query(`INSERT INTO owner_portal_grants(token_hash,user_id,session_hash,pin_set_at,expires_at)
  SELECT $1,id,$2,action_pin_set_at,now()+interval '10 minutes' FROM users WHERE id=$3
  ON CONFLICT(user_id,session_hash) DO UPDATE SET token_hash=EXCLUDED.token_hash,pin_set_at=EXCLUDED.pin_set_at,expires_at=EXCLUDED.expires_at`,[digest(token),user.session_hash,user.id]);
  await tx.query("INSERT INTO audit_logs(actor_id,action,details) VALUES($1,'OWNER_PIN_CHANGED',$2)",[user.id,JSON.stringify({reauth:'current_pin_and_totp'})]);
  return true;
 });
 if(!result) denied();
 return {grant:token,expiresIn:600};
}

