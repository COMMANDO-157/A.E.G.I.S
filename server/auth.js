import {eligibleRoster} from './enrollment.js';
import {validateGoogleClaims,normalizeEmail} from './google-identity.js';
import {randomBytes,createHash} from 'node:crypto';
import {OAuth2Client} from 'google-auth-library';
import {database,transaction} from './db.js';
import {fail,active} from './policy.js';
import {appOrigin,configured,production} from './config.js';
export {configured} from './config.js';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function cookies(req) {
 return Object.fromEntries((req.headers.cookie||'').split(';').map(part=>{const i=part.indexOf('='); return i<0?['','']:[part.slice(0,i).trim(),part.slice(i+1)];}));
}
export function cookie(name,value,seconds) {
 const secure=production()||appOrigin().startsWith('https:');
 return name+'='+value+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+seconds+(secure?'; Secure':'');
}
export function checkOrigin(req) {
 if(!process.env.APP_ORIGIN) fail(503,'APP_ORIGIN is not configured.');
 if(req.headers.origin!==appOrigin()) fail(403,'Request origin rejected.');
}
export async function challenge(res) {
 if(!configured()) fail(503,'Google sign-in and database are not configured.');
 const nonce=randomBytes(32).toString('base64url');
 await database().query("INSERT INTO auth_challenges(token_hash,expires_at) VALUES($1,now()+interval '5 minutes')",[digest(nonce)]);
 res.setHeader('Set-Cookie',cookie('aegis_challenge',nonce,300));
 return {nonce,clientId:process.env.GOOGLE_CLIENT_ID};
}
export async function login(req,res,credential,{
 runTransaction=transaction,
 verifyCredential=async credential => (await new OAuth2Client(process.env.GOOGLE_CLIENT_ID).verifyIdToken({idToken:credential,audience:process.env.GOOGLE_CLIENT_ID})).getPayload()
}={}) {
 if(!configured()) fail(503,'Authentication is not configured.');
 const nonce=cookies(req).aegis_challenge;
 if(!nonce) {
  console.warn('[AUTH] Login rejected: aegis_challenge cookie is missing from request.');
  fail(401,'Login challenge cookie is missing or expired. Please refresh and try again.');
 }
 if(typeof credential!=='string'||credential.length>12000) {
  console.warn('[AUTH] Login rejected: invalid Google credential payload.');
  fail(401,'Invalid login challenge.');
 }
 let payload;
 try {
  payload=await verifyCredential(credential);
 } catch (err) {
  console.warn('[AUTH] Google ID token verification failed:', err?.message || 'verification error');
  fail(401,'Google identity token was rejected.');
 }
 if(!['accounts.google.com','https://accounts.google.com'].includes(payload?.iss)||payload?.aud!==process.env.GOOGLE_CLIENT_ID||!Number.isFinite(payload?.exp)||payload.exp<=Date.now()/1000) {
  console.warn('[AUTH] Google token claims rejected (iss, aud, or exp).');
  fail(401,'Google token claims rejected.');
 }
 if(!payload?.sub || !payload.email || payload.email_verified!==true) {
  console.warn('[AUTH] Google user identity unverified (missing sub/email or unverified email).');
  fail(401,'Google identity or nonce was rejected.');
 }
 if(payload.nonce!==nonce) {
  console.warn('[AUTH] Nonce mismatch: Google token nonce does not match aegis_challenge cookie.');
  fail(401,'Google identity or nonce was rejected.');
 }
 validateGoogleClaims(payload,process.env.GOOGLE_CLIENT_ID);
 const token=randomBytes(32).toString('base64url');
 const user=await runTransaction(async db=>{
  const consumed=await db.query('DELETE FROM auth_challenges WHERE token_hash=$1 AND expires_at>now() RETURNING token_hash',[digest(nonce)]);
  if(!consumed.rowCount) {
   console.warn('[AUTH] Login challenge not found in DB or expired.');
   fail(401,'Login challenge expired or already used.');
  }
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['google-sub:'+payload.sub]);
  let result=await db.query('SELECT * FROM users WHERE google_subject_id=$1 FOR UPDATE',[payload.sub]);
  if(result.rows.length>1) fail(409,'Ambiguous Google identity binding.');
  let user=result.rows[0];
  if(user) {
   const duplicates=(await db.query('SELECT id FROM users WHERE lower(email)=lower($1) AND id<>$2',[payload.email,user.id])).rows;
   if(duplicates.length) fail(409,'Google email conflicts with an existing account; no accounts were merged.');
   user=(await db.query('UPDATE users SET email=$1,name=$2 WHERE id=$3 RETURNING *',[payload.email,payload.name||user.name,user.id])).rows[0];
  } else {
   const existingByEmail=(await db.query('SELECT * FROM users WHERE lower(email)=lower($1)',[payload.email])).rows[0];
   if(existingByEmail) {
    fail(409,'An account with this institutional email already exists. Sign in with your password and link your Google account.');
   }
   const inserted=await db.query(
    'INSERT INTO users(google_subject_id,email,name) VALUES($1,$2,$3) RETURNING *',
    [payload.sub,payload.email,payload.name||'Student']
   );
   user=inserted.rows[0];
  }
  // Institutional Auto-Verification on Google Login:
  // If student account is unverified, check if email matches an active roster row on a trusted institutional domain
  if(user.role === 'student' && !user.is_verified_student && !user.roster_id) {
   const emailNorm = normalizeEmail(payload.email);
   // The schema-006 deployment has no institutions table. Preserve Google login,
   // but never infer enrollment from fallback/example domains on that schema.
   const schema=(await db.query("SELECT to_regclass('public.institutions') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.student_rosters'::regclass AND attname='institution_id' AND NOT attisdropped) AS available")).rows[0];
   // Consumer Gmail ownership cannot become institutional evidence through domain configuration.
   if(schema?.available===true && !['gmail.com','googlemail.com'].includes(emailNorm.split('@')[1])) {
    const matchingRosters = (await db.query(
     `SELECT sr.*, d.name AS dept_name FROM student_rosters sr JOIN institutions i ON i.id=sr.institution_id AND i.active=true AND 'INSTITUTIONAL_EMAIL'=ANY(i.supported_methods) JOIN departments d ON d.code=sr.department_code AND d.active=true AND d.institution_id=sr.institution_id WHERE lower(sr.institutional_email)=$1 AND split_part(lower(sr.institutional_email),'@',2)=ANY(i.domains) AND sr.is_active=true AND sr.is_test_record=false AND (sr.bound_user_id IS NULL OR sr.bound_user_id=$2) FOR UPDATE OF sr`,
     [emailNorm, user.id]
    )).rows;
    if(matchingRosters.length>1) fail(409,'Ambiguous authoritative roster match.');
    const matchingRoster=matchingRosters[0];
    if(matchingRoster) {
     await db.query('UPDATE student_rosters SET bound_user_id=$1, updated_at=now() WHERE id=$2', [user.id, matchingRoster.id]);
     const updatedUser = await db.query(
      'UPDATE users SET is_verified_student=true, roster_id=$1, department_code=$2, department=$3 WHERE id=$4 RETURNING *',
      [matchingRoster.id, matchingRoster.department_code, matchingRoster.dept_name || matchingRoster.department_code, user.id]
     );
     user = updatedUser.rows[0];
     await db.query(
      `INSERT INTO student_verification_requests(user_id, roster_id, institution_id, status, claim_channel, verification_method, notes, reviewed_at)
       VALUES($1, $2, $3, 'APPROVED', 'INSTITUTIONAL_OAUTH_EXACT', 'INSTITUTIONAL_EMAIL_MATCH', 'Auto-approved on Google OAuth institutional login.', now())
       ON CONFLICT DO NOTHING`,
      [user.id, matchingRoster.id, matchingRoster.institution_id]
     );
     await db.query("INSERT INTO audit_logs(actor_id,action) VALUES($1,'STUDENT_VERIFIED_AUTO')",[user.id]);
    }
   }
  }

  if(user.role==='student' && user.roster_id) {
   const roster=await eligibleRoster(db,user.roster_id);
   user.is_verified_student=Boolean(roster && roster.bound_user_id===user.id);
  } else if(user.role==='student') user.is_verified_student=false;
  active(user);
  await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",[digest(token),user.id]);
  await db.query("INSERT INTO audit_logs(actor_id,action) VALUES($1,'GOOGLE_SIGN_IN')",[user.id]);
  return user;
 });
 res.setHeader('Set-Cookie',[cookie('aegis_session',token,28800),cookie('aegis_challenge','',0)]);
 return user;
}
export async function sessionUser(req,db) {
 const token=cookies(req).aegis_session;
 if(!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail(401,'Sign in required.');
 const dbClient=db||database();
 const result=await dbClient.query('SELECT u.*,s.expires_at AS session_expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[digest(token)]);
 const user=result.rows[0]; active(user);
 if(!user.session_expires_at||!Number.isFinite(new Date(user.session_expires_at).getTime())||new Date(user.session_expires_at).getTime()<=Date.now()) fail(401,'Session expired.');
 user.session_hash = digest(token);

 // If user is admin, query their assigned permissions in admin_permissions
 if(user.role==='admin') {
  try {
   const permsResult=await dbClient.query('SELECT permission FROM admin_permissions WHERE user_id=$1',[user.id]);
   user.permissions=permsResult.rows.map(r=>r.permission);
  } catch {
   user.permissions=[];
  }
 } else {
  user.permissions=[];
 }

 // Query authority assignments for staff roles (HOD, Dean, Higher Authority)
 try {
  const assignsResult=await dbClient.query('SELECT department_code FROM authority_assignments WHERE user_id=$1 AND active=true',[user.id]);
  user.assigned_departments=assignsResult.rows.map(r=>r.department_code);
 } catch {
  user.assigned_departments=[];
 }

 // Query authoritative active student roster binding for students
 if(user.role==='student' && user.roster_id) {
  try {
   const r=await eligibleRoster(dbClient,user.roster_id);
   if(r && r.bound_user_id===user.id) {
    user.active_roster=r;
    user.is_verified_student=true;
    user.register_number=r.register_number;
   } else {
    user.active_roster=null;
    user.is_verified_student=false;
   }
  } catch {
   user.active_roster=null;
   user.is_verified_student=false;
  }
 } else if(user.role==='student') {
  user.active_roster=null;
  user.is_verified_student=false;
 }

 return user;
}
export async function logout(req,res,db) {
 const token=cookies(req).aegis_session;
 res.setHeader('Set-Cookie',[cookie('aegis_session','',0),cookie('aegis_challenge','',0)]);
 if(token && /^[A-Za-z0-9_-]{43}$/.test(token)) await (db||database()).query('DELETE FROM sessions WHERE token_hash=$1',[digest(token)]);
}

/**
 * Step-up token generation and validation (time-limited 10-minute token)
 * Strictly bound to user_id, purpose, current session (session_hash), and expiry.
 * Consumed atomically on verification (exactly once).
 */
export async function issueStepUpToken(userId, purpose, db, sessionHash=null) {
 const token=randomBytes(32).toString('base64url');
 const dbClient=db||database();
 await dbClient.query(
  "INSERT INTO step_up_tokens(token_hash,user_id,purpose,session_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",
  [digest(token),userId,purpose,sessionHash]
 );
 return token;
}

export async function verifyStepUpToken(userId, purpose, token, db, sessionHash=null) {
 if(!token || typeof token!=='string') return false;
 const dbClient=db||database();
 let sql = 'DELETE FROM step_up_tokens WHERE token_hash=$1 AND user_id=$2 AND purpose=$3 AND expires_at>now()';
 const params = [digest(token), userId, purpose];
 if(sessionHash) {
  sql += ' AND session_hash=$4';
  params.push(sessionHash);
 }
 sql += ' RETURNING token_hash';
 const result = await dbClient.query(sql, params);
 return Boolean(result.rowCount);
}

/**
 * Creates and sets an authenticated session cookie for a verified user
 */
export async function createSession(user, res, db) {
 const token = randomBytes(32).toString('base64url');
 const dbClient = db || database();
 await dbClient.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')", [digest(token), user.id]);
 res.setHeader('Set-Cookie', [cookie('aegis_session', token, 28800), cookie('aegis_challenge', '', 0)]);
 return token;
}

/**
 * Single-use password reset token management
 */
export async function issuePasswordResetToken(userId, db) {
 const token = randomBytes(32).toString('base64url');
 const dbClient = db || database();
 // Invalidate any older unused reset tokens for this user
 await dbClient.query('UPDATE password_reset_tokens SET used=true WHERE user_id=$1 AND used=false', [userId]);
 await dbClient.query(
  "INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
  [digest(token), userId]
 );
 return token;
}

export async function verifyAndConsumePasswordResetToken(token, db) {
 if (!token || typeof token !== 'string') return null;
 const dbClient = db || database();
 const res = await dbClient.query(
  'UPDATE password_reset_tokens SET used=true, used_at=now() WHERE token_hash=$1 AND used=false AND expires_at>now() RETURNING user_id',
  [digest(token)]
 );
 return res.rows[0]?.user_id || null;
}

