import {randomBytes,createHash} from 'node:crypto';
import {OAuth2Client} from 'google-auth-library';
import {database,transaction} from './db.js';
import {fail,active} from './policy.js';
import {appOrigin,configured} from './config.js';
export {configured} from './config.js';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function cookies(req) {
 return Object.fromEntries((req.headers.cookie||'').split(';').map(part=>{const i=part.indexOf('='); return i<0?['','']:[part.slice(0,i).trim(),part.slice(i+1)];}));
}
export function cookie(name,value,seconds) {
 const secure=appOrigin().startsWith('https:');
 return name+'='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+seconds+(secure?'; Secure':'');
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
export async function login(req,res,credential) {
 if(!configured()) fail(503,'Authentication is not configured.');
 const nonce=cookies(req).aegis_challenge;
 if(!nonce || typeof credential!=='string'||credential.length>12000) fail(401,'Invalid login challenge.');
 let payload;
 try { const ticket=await new OAuth2Client(process.env.GOOGLE_CLIENT_ID).verifyIdToken({idToken:credential,audience:process.env.GOOGLE_CLIENT_ID}); payload=ticket.getPayload(); }
 catch { fail(401,'Google identity token was rejected.'); }
 if(!['accounts.google.com','https://accounts.google.com'].includes(payload?.iss)||payload?.aud!==process.env.GOOGLE_CLIENT_ID||!Number.isFinite(payload?.exp)||payload.exp<=Date.now()/1000) fail(401,'Google token claims rejected.');
 if(!payload?.sub || !payload.email || payload.email_verified!==true || payload.nonce!==nonce) fail(401,'Google identity or nonce was rejected.');
 const token=randomBytes(32).toString('base64url');
 const user=await transaction(async db=>{
  const consumed=await db.query('DELETE FROM auth_challenges WHERE token_hash=$1 AND expires_at>now() RETURNING token_hash',[digest(nonce)]);
  if(!consumed.rowCount) fail(401,'Login challenge expired or already used.');
  const result=await db.query("INSERT INTO users(google_subject_id,email,name) VALUES($1,$2,$3) ON CONFLICT(google_subject_id) DO UPDATE SET email=excluded.email,name=excluded.name RETURNING *",[payload.sub,payload.email,payload.name||'Student']);
  const user=result.rows[0]; active(user);
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
 const result=await (db||database()).query('SELECT u.*,s.expires_at AS session_expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[digest(token)]);
 const user=result.rows[0]; active(user);
 if(!user.session_expires_at||!Number.isFinite(new Date(user.session_expires_at).getTime())||new Date(user.session_expires_at).getTime()<=Date.now()) fail(401,'Session expired.');
 return user;
}
export async function logout(req,res,db) {
 const token=cookies(req).aegis_session;
 res.setHeader('Set-Cookie',[cookie('aegis_session','',0),cookie('aegis_challenge','',0)]);
 if(token && /^[A-Za-z0-9_-]{43}$/.test(token)) await (db||database()).query('DELETE FROM sessions WHERE token_hash=$1',[digest(token)]);
}
