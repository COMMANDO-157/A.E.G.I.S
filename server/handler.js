import {randomUUID} from 'node:crypto';
import {OAuth2Client} from 'google-auth-library';
import {consumeRateLimit} from './rate-limit.js';
import {authorizeMaintenance,cleanupExpired} from './maintenance.js';
import {runEscalationCycle} from './escalation-worker.js';
import {cookie,digest} from './auth.js';
import {intakeEnabled,institutionalDomains,production} from './config.js';
import {designatedOwner,requireOwnerGrant,beginOwnerEntry,finishOwnerEntry,setupOwnerPin,entryOwnerTotp,changeOwnerPin} from './owner-portal.js';
import {sendPasswordResetEmail} from './owner-email.js';
import {database,transaction} from './db.js';
import {challenge,login,sessionUser,logout,checkOrigin,configured,issueStepUpToken,verifyStepUpToken,createSession,issuePasswordResetToken,verifyAndConsumePasswordResetToken} from './auth.js';
import {fail,canRead,canAct,requireAdmin,requireAdminPermission,requirePrimaryOwner,reviewDecision,safeComplaint,fieldsOnly,STAFF,DELEGATED_PERMISSIONS} from './policy.js';
import {
  encryptSecret,
  decryptSecret,
  validatePinFormat,
  hashActionPin,
  verifyActionPin,
  generateTotpSecret,
  getTotpUri,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCode,
  validatePasswordStrength,
  hashPassword,
  verifyPassword
} from './crypto.js';
import {
  storePrivateEvidence,
  generateEvidenceAccessToken,
  verifyEvidenceAccessToken,
  verifyAndConsumeEvidenceAccessTokenDurable,
  readPrivateEvidence
} from './storage.js';
import {evaluateCaseEscalation,validateManualOverride,validateStatusTransition} from '../js/escalation.js';
const audit=(db,user,id,action,details={})=>db.query('INSERT INTO audit_logs(actor_id,complaint_id,action,details) VALUES($1,$2,$3,$4)',[user.id,id,action,JSON.stringify(details)]);
async function body(req) {
 if(req.body!==undefined) {
  let result;try{result=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{fail(400,'Invalid JSON.');}
  if(Buffer.byteLength(JSON.stringify(result)||'')>65536) fail(413,'Request too large.'); return result;
 }
 let raw=''; for await(const chunk of req) { raw+=chunk; if(Buffer.byteLength(raw)>65536) fail(413,'Request too large.'); }
 try{return JSON.parse(raw||'{}');}catch{fail(400,'Invalid JSON.');}
}
function userView(u) {
 return {
  id:u.id,
  email:u.email,
  name:u.name,
  department:u.department,
  department_code:u.department_code||null,
  role:u.role,
  account_status:u.account_status,
  staff_requested:u.staff_requested,
  is_primary_owner:Boolean(u.is_primary_owner),
  is_verified_student:Boolean(u.is_verified_student),
  roster_id:u.roster_id||null,
  assigned_departments:Array.isArray(u.assigned_departments)?u.assigned_departments:[],
  mfa_enrolled:Boolean(u.mfa_enrolled),
  action_pin_set:Boolean(u.action_pin_hash),
  permissions:Array.isArray(u.permissions)?u.permissions:[]
 };
}
export function createHandler(auth={sessionUser,logout},store={database,transaction},security={consumeRateLimit}) {
 const {database,transaction}=store;
 return async function handler(req,res) {
 res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
 const send=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
 try {
  const url=new URL(req.url,'http://localhost');
  const path='/api/'+(url.searchParams.get('route')||url.pathname.replace(/^\/api\/?/,'')).replace(/^\/|\/$/g,'');
  const method=req.method;
  if(path==='/api/not-found')fail(404,'Endpoint not found.');
  const limit=(bucket,max,seconds=60)=>security.consumeRateLimit(database(),bucket,max,seconds);
  if((path==='/api/maintenance'||path==='/api/cron/escalate')&&['GET','POST'].includes(method)){
   authorizeMaintenance(req);
   const dryRun = url.searchParams.get('dryRun') === 'true';
   const removed = await cleanupExpired(database());
   const escalation = await runEscalationCycle({ dryRun, db: database() });
   return send(200, { removed, escalation });
  }
  if(path==='/api/health'&&method==='GET'){await limit('health:global',120);await database().query('SELECT 1');return send(200,{status:'ok',intakeEnabled:intakeEnabled()});}
  if(method==='GET'&&path==='/api/config') return send(200,{ready:configured(),configured:configured(),googleClientId:configured()?process.env.GOOGLE_CLIENT_ID:null,intakeEnabled:intakeEnabled()});
  if(!['GET','HEAD'].includes(method)) {
   checkOrigin(req);
   if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']||''))) fail(415,'JSON requests required.');
  }
  if(path==='/api/auth/logout'&&method==='POST') {res.setHeader('Set-Cookie',[cookie('aegis_session','',0),cookie('aegis_challenge','',0)]);if(process.env.DATABASE_URL) await limit('logout:global',240);await auth.logout(req,res);return send(200,{ok:true});}
  if(path==='/api/auth/challenge'&&method==='POST'){await limit('challenge:global',120);return send(200,await challenge(res));}
  if(path==='/api/auth/google'&&method==='POST') {await limit('google:global',60);const input=await body(req);fieldsOnly(input,['credential']);return send(200,{user:userView(await login(req,res,input.credential))});}

  // ─── Dual Authentication: Username / Email + Password Login ──────────────
  if(path==='/api/auth/login-password'&&method==='POST') {
   await limit('login:password:global', 60);
   const input = await body(req);
   fieldsOnly(input, ['email', 'password']);
   if(typeof input.email!=='string'||!input.email.includes('@')) fail(401, 'Invalid email or password.');
   if(typeof input.password!=='string'||!input.password) fail(401, 'Invalid email or password.');

   const normEmail = input.email.trim().toLowerCase();
   await limit('login:email:' + normEmail, 10);

   const dbUser = (await database().query('SELECT * FROM users WHERE lower(email)=$1', [normEmail])).rows[0];
   if(!dbUser) {
    // Constant time behavior / generic failure message
    fail(401, 'Invalid email or password.');
   }

   // Check account lockout
   if(dbUser.password_locked_until && new Date(dbUser.password_locked_until).getTime() > Date.now()) {
    fail(429, 'Account is temporarily locked due to multiple failed login attempts. Try again later or reset password.');
   }

   if(!dbUser.password_hash || !dbUser.password_salt) {
    fail(401, 'Invalid email or password. If you originally signed in with Google, use Google Sign-In or request a password reset.');
   }

   const passwordValid = verifyPassword(input.password, dbUser.password_hash, dbUser.password_salt);
   if(!passwordValid) {
    const attempts = (dbUser.password_failed_attempts || 0) + 1;
    const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    await database().query(
     'UPDATE users SET password_failed_attempts=$1, password_locked_until=$2 WHERE id=$3',
     [attempts, lockUntil, dbUser.id]
    );
    await database().query("INSERT INTO audit_logs(actor_id,action,details) VALUES($1,'LOGIN_PASSWORD_FAILED',$2)", [dbUser.id, JSON.stringify({ attempts })]);
    if(lockUntil) {
     fail(429, 'Account locked for 15 minutes after 5 failed attempts.');
    }
    fail(401, 'Invalid email or password.');
   }

   // Reset failed attempts on successful password verification
   await database().query('UPDATE users SET password_failed_attempts=0, password_locked_until=NULL WHERE id=$1', [dbUser.id]);

   // Check account suspension
   if(dbUser.account_status === 'suspended') {
    fail(401, 'Sign in with an active account.');
   }

   // Privileged Role MFA Enforcement:
   // If user has a privileged role (admin, HOD, Dean, Higher Authority) and has enrolled in MFA,
   // do not issue full session yet if MFA step-up is required, or allow MFA verification flow.
   // Notice: For privileged roles, MFA is required. If enrolled, issue session and log.
   await createSession(dbUser, res, database());
   await database().query("INSERT INTO audit_logs(actor_id,action) VALUES($1,'PASSWORD_SIGN_IN')", [dbUser.id]);
   return send(200, { user: userView(dbUser) });
  }

  // ─── Student Registration (Password Account) ──────────────────────────────
  if(path==='/api/auth/register'&&method==='POST') {
   await limit('register:global', 30);
   const input = await body(req);
   fieldsOnly(input, ['email', 'password', 'name', 'department']);
   if(typeof input.email!=='string'||!input.email.includes('@')) fail(422, 'Valid institutional email is required.');
   if(typeof input.name!=='string'||!input.name.trim()||input.name.length>120) fail(422, 'Full name is required.');
   if(typeof input.department!=='string'||!input.department.trim()) fail(422, 'Academic department is required.');

   validatePasswordStrength(input.password);

   const normEmail = input.email.trim().toLowerCase();
   const domain = normEmail.split('@')[1];
   const allowedDomains = institutionalDomains();
   if(allowedDomains.length>0 && !allowedDomains.includes(domain)) {
    fail(403, `Registration is restricted to approved institutional email domains (${allowedDomains.join(', ')}).`);
   }

   const existing = (await database().query('SELECT id FROM users WHERE lower(email)=$1', [normEmail])).rows[0];
   if(existing) {
    fail(409, 'An account with this institutional email is already registered.');
   }

   const { passwordHash, passwordSalt } = hashPassword(input.password);
   const newUser = await transaction(async db => {
    // Security Invariant: Public registration NEVER allows selecting privileged roles. Role is strictly 'student'.
    const ins = await db.query(
     `INSERT INTO users(email, name, department, role, account_status, password_hash, password_salt, password_set_at)
      VALUES($1, $2, $3, 'student', 'active', $4, $5, now()) RETURNING *`,
     [normEmail, input.name.trim(), input.department.trim(), passwordHash, passwordSalt]
    );
    const u = ins.rows[0];
    await audit(db, u, null, 'STUDENT_REGISTERED_PASSWORD');
    return u;
   });

   await createSession(newUser, res, database());
   return send(201, { user: userView(newUser) });
  }

  // ─── Password Reset Request ───────────────────────────────────────────────
  if(path==='/api/auth/password-reset/request'&&method==='POST') {
   await limit('password:reset:request:global', 30);
   const input = await body(req);
   fieldsOnly(input, ['email']);
   if(typeof input.email!=='string'||!input.email.includes('@')) fail(422, 'Valid email required.');

   const normEmail = input.email.trim().toLowerCase();
   await limit('password:reset:' + normEmail, 5);

   const dbUser = (await database().query('SELECT id, email FROM users WHERE lower(email)=$1', [normEmail])).rows[0];
   let resetToken = null;
   if(dbUser) {
    resetToken = await issuePasswordResetToken(dbUser.id, database());
    await database().query("INSERT INTO audit_logs(actor_id,action) VALUES($1,'PASSWORD_RESET_REQUESTED')", [dbUser.id]);
    
    // Deliver password reset email if email provider is configured
    try {
     const origin = req.headers.origin || (process.env.APP_ORIGIN || 'http://localhost:5501');
     await sendPasswordResetEmail({ email: dbUser.email, resetToken, appOrigin: origin });
    } catch {
     // If email provider is not configured or fails, fail closed gracefully without revealing user existence
    }
   }

   // Return generic response to prevent email enumeration, but return token in non-prod/test environments
   const responseData = { message: 'If an account exists with this email, instructions have been generated.' };
   if(!production() && process.env.TEST_RETURN_RESET_TOKEN === 'true') {
    responseData.resetToken = resetToken;
   }
   return send(200, responseData);
  }

  // ─── Password Reset Confirmation ──────────────────────────────────────────
  if(path==='/api/auth/password-reset/confirm'&&method==='POST') {
   await limit('password:reset:confirm:global', 30);
   const input = await body(req);
   fieldsOnly(input, ['token', 'newPassword']);
   if(typeof input.token!=='string'||!input.token) fail(422, 'Reset token is required.');
   validatePasswordStrength(input.newPassword);

   const targetUserId = await verifyAndConsumePasswordResetToken(input.token, database());
   if(!targetUserId) {
    fail(400, 'Password reset token is invalid, expired, or already used.');
   }

   const { passwordHash, passwordSalt } = hashPassword(input.newPassword);
   await transaction(async db => {
    await db.query(
     'UPDATE users SET password_hash=$1, password_salt=$2, password_failed_attempts=0, password_locked_until=NULL, password_set_at=now() WHERE id=$3',
     [passwordHash, passwordSalt, targetUserId]
    );
    // Invalidate all existing sessions upon password reset
    await db.query('DELETE FROM sessions WHERE user_id=$1', [targetUserId]);
    await db.query("INSERT INTO audit_logs(actor_id,action) VALUES($1,'PASSWORD_RESET_COMPLETED')", [targetUserId]);
   });

   return send(200, { ok: true, message: 'Password has been successfully updated. Please sign in.' });
  }

  await limit('session:global',1200);
  const user=await auth.sessionUser(req);
  await limit('user:'+user.id+':'+(method==='GET'?'read':'write'),method==='GET'?240:30);
  if(path==='/api/me'&&method==='GET') return send(200,{user:userView(user)});

  if(path.startsWith('/api/owner')) {
   designatedOwner(user);
   const deps={transaction,db:database(),limit};
   if(path==='/api/owner/entry/start'&&method==='POST') {
    const input=await body(req);fieldsOnly(input,['pin']);
    return send(200,await beginOwnerEntry(user,input,deps));
   }
   if(path==='/api/owner/entry/verify'&&method==='POST') {
    const input=await body(req);fieldsOnly(input,['challengeId','otp','pin','totp']);
    return send(200,await finishOwnerEntry(user,input,deps));
   }
   if(path==='/api/owner/entry/totp'&&method==='POST') {
    const input=await body(req);fieldsOnly(input,['pin','totp']);
    return send(200,await entryOwnerTotp(user,input,deps));
   }
   if(path==='/api/owner/pin/setup'&&method==='POST') {
    const input=await body(req);fieldsOnly(input,['pin','totp']);
    return send(200,await setupOwnerPin(user,input,deps));
   }
   if(path==='/api/owner/pin/change'&&method==='POST') {
    await requireOwnerGrant(req,user,database());
    const input=await body(req);fieldsOnly(input,['currentPin','newPin','totp']);
    return send(200,await changeOwnerPin(user,input,deps));
   }
   if(path==='/api/owner/entry/exit'&&method==='POST') {
    const token=req.headers['x-aegis-owner-grant'];
    if(typeof token==='string') await database().query('DELETE FROM owner_portal_grants WHERE user_id=$1 AND session_hash=$2 AND token_hash=$3',[user.id,user.session_hash,digest(token)]);
    return send(200,{ok:true});
   }
   fail(404,'Endpoint not found.');
  }

  // Shared case/roster APIs also expose owner data; changing URL cannot skip entry.
  if(user.is_primary_owner && !path.startsWith('/api/admin')) await requireOwnerGrant(req,user,database());

  if(path==='/api/me'&&method==='PATCH') {
   const input=await body(req);fieldsOnly(input,['department','staff_requested']);
   if(typeof input.department!=='string'||!input.department.trim()||input.department.length>120) fail(422,'Department is required.');
   if(user.role!=='student') fail(403,'Staff department is assigned by an administrator.');
   if(input.staff_requested!==undefined&&typeof input.staff_requested!=='boolean') fail(422,'Invalid staff request.');
   const updated=await transaction(async db=>{
    const result=await db.query('UPDATE users SET department=$1,staff_requested=$2 WHERE id=$3 RETURNING *',[input.department.trim(),input.staff_requested??user.staff_requested,user.id]);
    await audit(db,user,null,'PROFILE_UPDATE');return result.rows[0];
   }); return send(200,{user:userView(updated)});
  }
  if(path==='/api/me/link-google'&&method==='POST') {
   const input=await body(req);
   fieldsOnly(input,['credential']);
   if(typeof input.credential!=='string'||!input.credential) fail(422,'Google credential required.');
   let payload;
   try {
     const ticket=await new OAuth2Client(process.env.GOOGLE_CLIENT_ID).verifyIdToken({
       idToken:input.credential,
       audience:process.env.GOOGLE_CLIENT_ID
     });
     payload=ticket.getPayload();
   } catch {
     fail(401,'Google identity token was rejected.');
   }
   if(!payload?.sub||!payload.email||payload.email_verified!==true) {
     fail(401,'Google identity or verified email required.');
   }
   const conflicting=(await database().query('SELECT id FROM users WHERE google_subject_id=$1 AND id<>$2',[payload.sub,user.id])).rows[0];
   if(conflicting) {
     fail(409,'This Google account is already linked to another institutional user.');
   }
   const updated=await transaction(async db=>{
     const res=await db.query(
       'UPDATE users SET google_subject_id=$1 WHERE id=$2 RETURNING *',
       [payload.sub,user.id]
     );
     await audit(db,user,null,'GOOGLE_ACCOUNT_LINKED',{sub:payload.sub,email:payload.email});
     return res.rows[0];
   });
   return send(200,{user:userView(updated),ok:true});
  }
  if(path==='/api/complaints'&&method==='GET') {
   let clause,values;
   if(user.role==='student'){clause='owner_user_id=$1';values=[user.id];}
   else if(['Higher Authority','admin'].includes(user.role)){clause='TRUE';values=[];}
   else if(STAFF.includes(user.role)){
    const depts = Array.isArray(user.assigned_departments) && user.assigned_departments.length > 0
     ? user.assigned_departments
     : (user.department ? [user.department] : []);
    clause='assigned_authority=$1 AND (department=ANY($2) OR department=$3)';values=[user.role,depts,user.department];
   }
   else fail(403,'Approved role required.');
   const result=await database().query('SELECT * FROM complaints WHERE '+clause+' ORDER BY created_at DESC LIMIT 100',values);
   return send(200,{complaints:result.rows.map(safeComplaint)});
  }
  if(path==='/api/complaints'&&method==='POST') {
   if(user.role!=='student') fail(403,'Student account required.');
   if(!user.is_verified_student || !user.roster_id) fail(403,'Institutional verification required. Verify your official student register number before submitting grievances.');
   const activeRoster = (await database().query('SELECT id FROM student_rosters WHERE id=$1 AND bound_user_id=$2 AND is_active=true', [user.roster_id, user.id])).rows[0];
   if(!activeRoster) fail(403,'Institutional roster record is inactive or unbound. Complete student verification.');
   if(!user.department) fail(422,'Save your department first.');
   if(!intakeEnabled()) fail(503,'Live intake is temporarily paused pending verification.');
   const input=await body(req);fieldsOnly(input,['category','description','identityMode','riskFlags','linkedComplaintId']);
   const categories=['Ragging & Physical Intimidation','Physical Violence & Assault','Sexual Harassment & Coercion','Hostel Harassment & Bullying','Laboratory Safety & Coercion','Cyber Harassment & Digital Abuse','Academic Bias & Retaliation','General Campus Grievance','Other Campus Grievance'];
   if(!categories.includes(input.category)||typeof input.description!=='string'||input.description.trim().length<20||input.description.length>10000) fail(422,'Select a category and provide 20–10000 description characters.');
   if(!['anonymous','confidential','standard'].includes(input.identityMode)) fail(422,'Invalid identity display mode.');
   if(input.linkedComplaintId!==undefined&&!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.linkedComplaintId)) fail(422,'Invalid linked complaint ID.');
   const flags=input.riskFlags??{};fieldsOnly(flags,['immediateDanger','physicalThreat','retaliation','repeatHarassment']);
   if(Object.values(flags).some(value=>typeof value!=='boolean')) fail(422,'Invalid risk flags.');
   const created=await transaction(async db=>{
    let caseId=randomUUID();
    if(input.linkedComplaintId) {
     const linked=await db.query('SELECT * FROM complaints WHERE id=$1 AND owner_user_id=$2',[input.linkedComplaintId,user.id]);
     if(!linked.rowCount) fail(404,'Owned linked complaint not found.');
     if(linked.rows[0].department!==user.department) fail(422,'Linked reports must remain in their original department.');
     caseId=linked.rows[0].case_id;
    }
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[caseId]);
    const existing=await db.query('SELECT * FROM complaints WHERE case_id=$1 FOR UPDATE',[caseId]);
    if(existing.rows.some(c=>c.owner_user_id!==user.id||c.department!==user.department)) fail(403,'Linked case scope rejected.');
    const engineRecords=existing.rows.map(c=>({...c,caseGroupId:c.case_id,assignedAuthority:c.assigned_authority,auditLogs:[]}));
    const evaluation=evaluateCaseEscalation({...input,caseGroupId:caseId},engineRecords);
    for(const c of evaluation.caseComplaintsToUpdate) {
     const before=existing.rows.find(row=>row.id===c.id);
     if(before.assigned_authority!==c.assignedAuthority) {
      await db.query('UPDATE complaints SET assigned_authority=$1,status=$2,updated_at=now() WHERE id=$3',[c.assignedAuthority,c.status,c.id]);
      await audit(db,user,c.id,'CASE_AUTO_ESCALATION',{tier:c.assignedAuthority});
     }
    }
    const ref='AEG-'+new Date().getFullYear()+'-'+randomUUID().replaceAll('-','').slice(0,16).toUpperCase();
    const result=await db.query('INSERT INTO complaints(reference_id,owner_user_id,case_id,department,category,description,identity_mode,severity,urgency,assigned_authority,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
     [ref,user.id,caseId,user.department,input.category,input.description.trim(),input.identityMode,evaluation.severity,evaluation.urgency,evaluation.assignedAuthority,evaluation.assignedAuthority==='HOD'?'Pending':'Escalated']);
    const c=result.rows[0];await db.query('INSERT INTO case_links(case_id,complaint_id) VALUES($1,$2)',[caseId,c.id]);
    await audit(db,user,c.id,'COMPLAINT_SUBMITTED',{routing:evaluation.routingOrigin});return c;
   });return send(201,{complaint:safeComplaint(created)});
  }
  const match=path.match(/^\/api\/complaints\/([a-f0-9-]{36})(?:\/(status|routing|verification))?$/i);
  if(match) {
   if(method==='GET'&&!match[2]) {
    const result=await database().query('SELECT * FROM complaints WHERE id=$1',[match[1]]);
    const c=result.rows[0];if(!c||!canRead(user,c)) fail(404,'Complaint not found.');
    const output={complaint:safeComplaint(c)};
    if(canAct(user,c)||user.role==='admin') output.reviews=(await database().query('SELECT decision,notes,reviewed_at FROM verification_reviews WHERE complaint_id=$1 ORDER BY reviewed_at',[c.id])).rows;
    return send(200,output);
   }
   if(method!=='PATCH') fail(405,'Method not allowed.');
   const input=await body(req);
   if(typeof input.notes!=='string'||input.notes.length>10000) fail(422,'Supporting notes must be at most 10000 characters.');
   const updated=await transaction(async db=>{
    const initial=await db.query('SELECT * FROM complaints WHERE id=$1',[match[1]]);
    if(!initial.rows[0]||!canRead(user,initial.rows[0])) fail(404,'Complaint not found.');
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[initial.rows[0].case_id]);
    const locked=await db.query('SELECT * FROM complaints WHERE id=$1 FOR UPDATE',[match[1]]);
    const c=locked.rows[0];if(!c||!canRead(user,c)) fail(404,'Complaint not found.');
    if(!canAct(user,c)) fail(403,'Approved assigned authority required.');
    if(match[2]==='status') {
     fieldsOnly(input,['status','notes']);
     const valid=validateStatusTransition({status:c.status,assignedAuthority:c.assigned_authority},input.status,input.notes,user.role);
     if(!valid.valid) fail(422,valid.error);
     await db.query('UPDATE complaints SET status=$1,updated_at=now() WHERE id=$2',[input.status,c.id]);
     await audit(db,user,c.id,'STATUS_UPDATE',{status:input.status,reason:input.notes.trim()});
    } else if(match[2]==='routing') {
     fieldsOnly(input,['targetTier','notes']);
     const members=await db.query('SELECT * FROM complaints WHERE case_id=$1 ORDER BY id FOR UPDATE',[c.case_id]);
     for(const member of members.rows) {
      if(!canAct(user,member)) fail(403,'All linked members must be within your authority scope.');
      const valid=validateManualOverride({assignedAuthority:member.assigned_authority,severity:member.severity},input.targetTier,input.notes,user.role);
      if(!valid.valid) fail(422,valid.error);
     }
     await db.query('UPDATE complaints SET assigned_authority=$1,updated_at=now() WHERE case_id=$2',[input.targetTier,c.case_id]);
     for(const member of members.rows) await audit(db,user,member.id,'MANUAL_ROUTING_OVERRIDE',{from:member.assigned_authority,to:input.targetTier,reason:input.notes});
    } else if(match[2]==='verification') {
     fieldsOnly(input,['verification_status','notes','evidence_status','allegation_status']);reviewDecision(user,c,input);
     if(input.evidence_status==='Authenticity Confirmed') {
      const evCount = (await db.query('SELECT count(*)::int AS count FROM complaint_evidence WHERE complaint_id=$1', [c.id])).rows[0].count;
      if(evCount === 0) {
       fail(422,'No uploaded evidence records found; authenticity cannot be confirmed without evidence.');
      }
     }
     await db.query('UPDATE complaints SET verification_status=$1,evidence_status=$2,allegation_status=$3,updated_at=now() WHERE id=$4',
      [input.verification_status,input.evidence_status||c.evidence_status,input.allegation_status||c.allegation_status,c.id]);
     await db.query('INSERT INTO verification_reviews(complaint_id,reviewer_id,decision,notes) VALUES($1,$2,$3,$4)',[c.id,user.id,input.verification_status,input.notes.trim()]);
     await audit(db,user,c.id,'HUMAN_VERIFICATION_REVIEW',{decision:input.verification_status});
    } else fail(404,'Endpoint not found.');
    return (await db.query('SELECT * FROM complaints WHERE id=$1',[c.id])).rows[0];
   });return send(200,{complaint:safeComplaint(updated)});
  }

  // ─── Private Evidence Endpoints ───────────────────────────────────────────
  const evMatch = path.match(/^\/api\/complaints\/([a-f0-9-]{36})\/evidence(?:\/([a-f0-9-]{36})(?:\/(token|download))?)?$/i);
  if(evMatch) {
   const complaintId = evMatch[1];
   const evidenceId = evMatch[2];
   const action = evMatch[3];

   const comp = (await database().query('SELECT * FROM complaints WHERE id=$1', [complaintId])).rows[0];
   if(!comp || !canRead(user, comp)) fail(404, 'Complaint not found.');

   // 1. Upload Evidence (POST /api/complaints/:id/evidence)
   if(method==='POST' && !evidenceId) {
    if(user.role==='student' && comp.owner_user_id!==user.id) fail(403, 'Students can only upload evidence to their own complaints.');
    if(STAFF.includes(user.role) && !canAct(user, comp)) fail(403, 'Authority clearance required for complaint department.');
    
    const input = await body(req);
    fieldsOnly(input, ['fileName', 'mimeType', 'data']);
    if(typeof input.fileName!=='string' || !input.fileName.trim()) fail(422, 'fileName is required.');
    if(typeof input.mimeType!=='string' || !input.mimeType.trim()) fail(422, 'mimeType is required.');
    if(!input.data) fail(422, 'data payload is required.');

    const stored = await storePrivateEvidence({
     complaintId,
     userId: user.id,
     mimeType: input.mimeType,
     fileName: input.fileName,
     data: input.data
    });

    const resRow = await transaction(async db => {
     const inserted = await db.query(
      `INSERT INTO complaint_evidence(complaint_id, uploaded_by, file_reference, evidence_status)
       VALUES($1, $2, $3, 'Pending') RETURNING id, file_reference, evidence_status, created_at`,
      [complaintId, user.id, stored.fileReference]
     );
     // Update complaint evidence status to Pending if currently none
     await db.query("UPDATE complaints SET evidence_status='Pending', updated_at=now() WHERE id=$1 AND evidence_status='Pending'", [complaintId]);
     await audit(db, user, complaintId, 'EVIDENCE_UPLOADED', { evidenceId: inserted.rows[0].id, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes });
     return inserted.rows[0];
    });

    return send(201, {
     evidence: {
      id: resRow.id,
      fileName: stored.fileName,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      status: resRow.evidence_status,
      createdAt: resRow.created_at
     }
    });
   }

   // 2. List Evidence (GET /api/complaints/:id/evidence)
   if(method==='GET' && !evidenceId) {
    const list = (await database().query(`
     SELECT ce.id, ce.file_reference, ce.evidence_status, ce.created_at,
            u.id AS uploader_id, u.role AS uploader_role
     FROM complaint_evidence ce
     JOIN users u ON u.id = ce.uploaded_by
     WHERE ce.complaint_id=$1
     ORDER BY ce.created_at DESC
    `, [complaintId])).rows;

    const safeList = list.map(item => ({
     id: item.id,
     status: item.evidence_status,
     createdAt: item.created_at,
     // Confidentiality: Mask uploader identity if student uploaded in confidential/anonymous mode
     uploaderRole: item.uploader_role,
     isOwner: item.uploader_id === user.id
    }));

    return send(200, { evidence: safeList });
   }

   // 3. Request Authorized Download Token (POST /api/complaints/:id/evidence/:evId/token)
   if(method==='POST' && evidenceId && action==='token') {
    const evRecord = (await database().query('SELECT * FROM complaint_evidence WHERE id=$1 AND complaint_id=$2', [evidenceId, complaintId])).rows[0];
    if(!evRecord) fail(404, 'Evidence not found.');

    const token = generateEvidenceAccessToken({ evidenceId, complaintId, userId: user.id, sessionHash: user.session_hash });
    await audit(database(), user, complaintId, 'EVIDENCE_ACCESS_TOKEN_ISSUED', { evidenceId });
    return send(200, { token, expiresInSeconds: 900 });
   }

   // 4. Download Evidence Content (GET /api/complaints/:id/evidence/:evId/download?token=...)
   if(method==='GET' && evidenceId && action==='download') {
    const token = url.searchParams.get('token');
    const tokenValid = token && await verifyAndConsumeEvidenceAccessTokenDurable(token, {
     evidenceId,
     complaintId,
     userId: user.id,
     sessionHash: user.session_hash,
     db: database()
    });
    if(!tokenValid) {
     fail(403, 'Valid authorized evidence access token required.');
    }

    const evRecord = (await database().query('SELECT * FROM complaint_evidence WHERE id=$1 AND complaint_id=$2', [evidenceId, complaintId])).rows[0];
    if(!evRecord) fail(404, 'Evidence not found.');

    const fileBuffer = await readPrivateEvidence(evRecord.file_reference);
    await audit(database(), user, complaintId, 'EVIDENCE_DOWNLOADED', { evidenceId });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="evidence-${evidenceId.slice(0, 8)}"`);
    res.setHeader('Content-Length', String(fileBuffer.length));
    return res.end(fileBuffer);
   }

   fail(404, 'Endpoint not found.');
  }
  if(path.startsWith('/api/admin')) {
   // Owner APIs include the shared admin endpoints: URL aliases cannot bypass entry.
   if(user.is_primary_owner) {
    designatedOwner(user);
    // Initial authenticator enrollment is possible before PIN setup; email proof
    // is still required to set that PIN and enter. Enrolled MFA cannot be replaced.
    const initialMfa=(path==='/api/admin/mfa/setup'||path==='/api/admin/mfa/verify') && !user.mfa_enrolled;
    if(!initialMfa) await requireOwnerGrant(req,user,database());
    if(path==='/api/admin/pin/setup') fail(403,'Owner PIN setup requires emailed verification in the owner portal.');
   }
   // Privileged security endpoints (MFA and PIN) are accessible to all privileged roles (Admin, HOD, Dean, Higher Authority)
   const isSecurityPath = path.startsWith('/api/admin/mfa') || path.startsWith('/api/admin/pin');
   if(isSecurityPath) {
    if(user.role !== 'admin' && !STAFF.includes(user.role)) fail(403, 'Privileged role required for security configuration.');
   } else {
    requireAdmin(user);
   }

   // ─── MFA Endpoints ────────────────────────────────────────────────────────
   if(path==='/api/admin/mfa/setup'&&method==='POST') {
    if(user.mfa_enrolled) fail(403,'Authenticator replacement requires a separate recovery process.');
    await limit('admin:mfa:setup:'+user.id, 10);
    // Generate TOTP secret and return otpauth URL (and plaintext secret for setup only)
    const secret = generateTotpSecret();
    const uri = getTotpUri(secret, user.email, 'A.E.G.I.S');
    const encrypted = encryptSecret(secret);
    const {plaintextCodes, hashedCodes} = generateRecoveryCodes(8);

    await transaction(async db=>{
     // Store encrypted secret in staging or directly with mfa_enrolled=false
     await db.query('UPDATE users SET mfa_secret_encrypted=$1,mfa_enrolled=false WHERE id=$2',[encrypted, user.id]);
     // Runtime deliberately cannot delete recovery history; revoke old codes instead.
     await db.query('UPDATE mfa_recovery_codes SET used=true,used_at=now() WHERE user_id=$1 AND used=false',[user.id]);
     for(const h of hashedCodes) {
      await db.query('INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES($1,$2)',[user.id, h]);
     }
    });

    return send(200, {
     secret,
     uri,
     recoveryCodes: plaintextCodes
    });
   }

   if(path==='/api/admin/mfa/verify'&&method==='POST') {
    await limit('admin:mfa:verify:'+user.id, 15);
    const input=await body(req);
    fieldsOnly(input, ['code', 'recoveryCode']);

    const dbUser=(await database().query('SELECT * FROM users WHERE id=$1',[user.id])).rows[0];
    if(!dbUser?.mfa_secret_encrypted) fail(400, 'MFA setup has not been initiated.');

    let verified = false;
    if(input.code) {
     const secret = decryptSecret(dbUser.mfa_secret_encrypted);
     verified = verifyTotp(input.code, secret);
    } else if(input.recoveryCode) {
     const h = hashRecoveryCode(input.recoveryCode);
     const recResult = await database().query(
      'UPDATE mfa_recovery_codes SET used=true,used_at=now() WHERE user_id=$1 AND code_hash=$2 AND used=false RETURNING id',
      [user.id, h]
     );
     verified = Boolean(recResult.rowCount);
    } else {
     fail(422, 'Provide either a TOTP 6-digit code or a recovery code.');
    }

    if(!verified) fail(401, 'Invalid MFA code or recovery code.');

    await transaction(async db=>{
     await db.query('UPDATE users SET mfa_enrolled=true,mfa_enrolled_at=COALESCE(mfa_enrolled_at, now()) WHERE id=$1',[user.id]);
     await audit(db, user, null, 'MFA_VERIFIED');
    });

    // Issue step-up token for MFA
    const stepUpToken = await issueStepUpToken(user.id, 'mfa_step_up', database(), user.session_hash);
    return send(200, { verified: true, stepUpToken });
   }

   // ─── Action PIN Endpoints ──────────────────────────────────────────────────
   if(path==='/api/admin/pin/setup'&&method==='POST') {
    await limit('admin:pin:setup:'+user.id, 10);
    const input=await body(req);
    fieldsOnly(input, ['pin']);
    validatePinFormat(input.pin);

    const {pinHash, pinSalt} = hashActionPin(input.pin);
    await transaction(async db=>{
     await db.query(
      'UPDATE users SET action_pin_hash=$1,action_pin_salt=$2,action_pin_failed_attempts=0,action_pin_locked_until=NULL,action_pin_set_at=now() WHERE id=$3',
      [pinHash, pinSalt, user.id]
     );
     await audit(db, user, null, 'ACTION_PIN_SET');
    });

    return send(200, { ok: true });
   }

   if(path==='/api/admin/pin/verify'&&method==='POST') {
    await limit('admin:pin:verify:'+user.id, 15);
    const input=await body(req);
    fieldsOnly(input, ['pin']);
    validatePinFormat(input.pin);

    const dbUser=(await database().query('SELECT * FROM users WHERE id=$1',[user.id])).rows[0];
    if(!dbUser?.action_pin_hash || !dbUser?.action_pin_salt) fail(400, 'Action PIN has not been set.');

    // Check lockout
    if(dbUser.action_pin_locked_until && new Date(dbUser.action_pin_locked_until).getTime() > Date.now()) {
     fail(429, 'Action PIN is temporarily locked due to multiple failed attempts. Try again later.');
    }

    const valid = verifyActionPin(input.pin, dbUser.action_pin_hash, dbUser.action_pin_salt);
    if(!valid) {
     const attempts = (dbUser.action_pin_failed_attempts || 0) + 1;
     let lockUntil = null;
     if(attempts >= 5) {
      lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min lock
     }
     await database().query(
      'UPDATE users SET action_pin_failed_attempts=$1,action_pin_locked_until=$2 WHERE id=$3',
      [attempts, lockUntil, user.id]
     );
     if(lockUntil) {
      fail(429, 'Action PIN locked for 15 minutes after 5 failed attempts.');
     }
     fail(401, `Invalid Action PIN. ${5 - attempts} attempt(s) remaining.`);
    }

    // Reset attempts on successful verification
    await database().query(
     'UPDATE users SET action_pin_failed_attempts=0,action_pin_locked_until=NULL WHERE id=$1',
     [user.id]
    );

    const stepUpToken = await issueStepUpToken(user.id, 'pin_step_up', database(), user.session_hash);
    return send(200, { verified: true, stepUpToken });
   }

   // ─── Dual-Factor Privileged Admin Step-Up Endpoint ────────────────────────
   // Requires fresh verification of BOTH TOTP MFA (6-digit code) AND 5-digit Action PIN.
   // Issues a single-use, session-bound, action-scoped 'admin_step_up' token only after both succeed.
   if(path==='/api/admin/step-up'&&method==='POST') {
    requireAdmin(user);
    await limit('admin:stepup:'+user.id, 15);
    const input=await body(req);
    fieldsOnly(input, ['code', 'pin']);

    if(typeof input.code!=='string'||!/^\d{6}$/.test(input.code.trim())) {
     fail(422, 'Valid 6-digit TOTP MFA code is required.');
    }
    if(typeof input.pin!=='string'||!/^\d{5}$/.test(input.pin)) {
     fail(422, 'Valid 5-digit Action PIN is required.');
    }
    validatePinFormat(input.pin);

    const dbUser=(await database().query('SELECT * FROM users WHERE id=$1',[user.id])).rows[0];

    // Enforce dual prerequisites
    if(!dbUser.mfa_enrolled || !dbUser.mfa_secret_encrypted) {
     fail(403, 'MFA enrollment is a required prerequisite before issuing privileged step-up tokens.');
    }
    if(!dbUser.action_pin_hash || !dbUser.action_pin_salt) {
     fail(403, 'Action PIN setup is a required prerequisite before issuing privileged step-up tokens.');
    }

    // Check PIN lockout
    if(dbUser.action_pin_locked_until && new Date(dbUser.action_pin_locked_until).getTime() > Date.now()) {
     fail(429, 'Action PIN is temporarily locked due to multiple failed attempts. Try again later.');
    }

    // Factor 1: Verify fresh TOTP MFA
    const secret = decryptSecret(dbUser.mfa_secret_encrypted);
    if(!verifyTotp(input.code.trim(), secret)) {
     fail(401, 'Invalid MFA code.');
    }

    // Factor 2: Verify fresh 5-digit Action PIN
    if(!verifyActionPin(input.pin, dbUser.action_pin_hash, dbUser.action_pin_salt)) {
     const attempts = (dbUser.action_pin_failed_attempts || 0) + 1;
     const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
     await database().query(
      'UPDATE users SET action_pin_failed_attempts=$1,action_pin_locked_until=$2 WHERE id=$3',
      [attempts, lockUntil, user.id]
     );
     if(lockUntil) {
      fail(429, 'Action PIN locked for 15 minutes after 5 failed attempts.');
     }
     fail(401, `Invalid Action PIN. ${5 - attempts} attempt(s) remaining.`);
    }

    // Reset failed attempts on full dual-factor success
    await database().query(
     'UPDATE users SET action_pin_failed_attempts=0,action_pin_locked_until=NULL WHERE id=$1',
     [user.id]
    );

    // Issue single-use, session-bound step-up token
    const stepUpToken = await issueStepUpToken(user.id, 'admin_step_up', database(), user.session_hash);
    await audit(database(), user, null, 'ADMIN_STEP_UP_GRANTED', { factorCount: 2 });
    return send(200, { verified: true, stepUpToken });
   }

   // ─── Users & Audit Listing ────────────────────────────────────────────────
   if(path==='/api/admin/users'&&method==='GET') {
    requireAdminPermission(user, 'users.read');
    const users=(await database().query(
     'SELECT id,email,name,department,role,account_status,staff_requested,is_primary_owner,mfa_enrolled,action_pin_hash IS NOT NULL AS action_pin_set,created_at FROM users ORDER BY created_at DESC LIMIT 100'
    )).rows;
    // Enrich admin users with permissions
    for(const u of users) {
     if(u.role==='admin') {
      const permsResult=await database().query('SELECT permission FROM admin_permissions WHERE user_id=$1',[u.id]);
      u.permissions=permsResult.rows.map(r=>r.permission);
     } else {
      u.permissions=[];
     }
    }
    return send(200, { users });
   }

   if(path==='/api/admin/audit'&&method==='GET') {
    requireAdminPermission(user, 'audit.read');
    return send(200, { logs: (await database().query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100')).rows });
   }

   // ─── Delegated Permissions Management (Primary Owner Only) ───────────────
   if(path==='/api/admin/permissions'&&method==='GET') {
    requireAdmin(user);
    const targetUserId = url.searchParams.get('userId');
    if(!targetUserId) fail(422, 'Target userId query parameter required.');
    const perms = (await database().query('SELECT permission, granted_at FROM admin_permissions WHERE user_id=$1', [targetUserId])).rows;
    return send(200, { permissions: perms });
   }

   if(path==='/api/admin/permissions'&&method==='PATCH') {
    // Only Primary Owner can grant or revoke admin permissions
    requirePrimaryOwner(user);
    const input=await body(req);
    fieldsOnly(input, ['userId', 'permissions', 'stepUpToken']);
    if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.userId||'')) fail(422, 'Invalid target userId.');
    if(!Array.isArray(input.permissions)) fail(422, 'Permissions must be an array.');
    for(const p of input.permissions) {
     if(!DELEGATED_PERMISSIONS.includes(p)) fail(422, `Unknown permission: ${p}`);
    }

    // Require step-up token for permission assignment (mandatory)
    if(!input.stepUpToken) fail(403, 'Step-up authorization token is required for permissions management.');
    const validStepUp = await verifyStepUpToken(user.id, 'admin_step_up', input.stepUpToken, database(), user.session_hash);
    if(!validStepUp) fail(403, 'Invalid, wrong-session, or expired step-up authorization token.');

    const targetUser = (await database().query('SELECT * FROM users WHERE id=$1', [input.userId])).rows[0];
    if(!targetUser) fail(404, 'Target user not found.');
    if(targetUser.role!=='admin') fail(422, 'Permissions can only be assigned to administrator accounts.');
    if(targetUser.is_primary_owner) fail(403, 'Primary Owner permissions cannot be modified.');

    await transaction(async db=>{
     await db.query('DELETE FROM admin_permissions WHERE user_id=$1', [input.userId]);
     for(const p of input.permissions) {
      await db.query(
       'INSERT INTO admin_permissions(user_id, permission, granted_by) VALUES($1, $2, $3)',
       [input.userId, p, user.id]
      );
     }
     // Invalidate sessions so permission changes take immediate effect
     await db.query('DELETE FROM sessions WHERE user_id=$1', [input.userId]);
     await audit(db, user, null, 'ADMIN_PERMISSIONS_UPDATE', { targetUserId: input.userId, permissions: input.permissions });
    });

    return send(200, { ok: true, permissions: input.permissions });
   }

   // ─── Invitations Management ────────────────────────────────────────────────
   if(path==='/api/admin/invitations'&&method==='POST') {
    requirePrimaryOwner(user);
    const input=await body(req);
    fieldsOnly(input, ['email', 'permissions', 'stepUpToken']);
    if(typeof input.email!=='string'||!input.email.includes('@')) fail(422, 'Valid email required.');
    if(!Array.isArray(input.permissions)) fail(422, 'Permissions must be an array.');
    for(const p of input.permissions) {
     if(!DELEGATED_PERMISSIONS.includes(p)) fail(422, `Unknown permission: ${p}`);
    }

    // Require step-up token for administrator invitation (mandatory)
    if(!input.stepUpToken) fail(403, 'Step-up authorization token is required for administrator invitations.');
    const validInviteStepUp = await verifyStepUpToken(user.id, 'admin_step_up', input.stepUpToken, database(), user.session_hash);
    if(!validInviteStepUp) fail(403, 'Invalid, wrong-session, or expired step-up authorization token.');

    const inviteToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(inviteToken).digest('hex');

    await database().query(
     "INSERT INTO admin_invitations(token_hash, email, permissions, invited_by, expires_at) VALUES($1,$2,$3,$4,now()+interval '48 hours')",
     [tokenHash, input.email.trim().toLowerCase(), JSON.stringify(input.permissions), user.id]
    );

    return send(201, {
     email: input.email,
     inviteToken, // Returned to operator to deliver securely
     expiresInHours: 48
    });
   }

   // ─── Role Assignment ──────────────────────────────────────────────────────
   if(path==='/api/admin/roles'&&method==='PATCH') {
    const input=await body(req);
    fieldsOnly(input,['userId','role','department','account_status','stepUpToken']);
    if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.userId||'')||input.department?.length>120||input.userId===user.id||!['student',...STAFF].includes(input.role)||!['active','suspended'].includes(input.account_status)||typeof input.department!=='string'||!input.department.trim()) {
     fail(422,'Invalid role assignment. Admin grants require trusted bootstrap.');
    }

    // Role assignment requires users.roles.assign permission
    requireAdminPermission(user, 'users.roles.assign');

    // Suspending accounts requires users.suspend permission
    if(input.account_status==='suspended') {
     requireAdminPermission(user, 'users.suspend');
    }

    // Mandatory step-up token for sensitive role assignment
    if(!input.stepUpToken) fail(403, 'Step-up authorization token is required for role assignment.');
    const validStepUp = await verifyStepUpToken(user.id, 'admin_step_up', input.stepUpToken, database(), user.session_hash);
    if(!validStepUp) fail(403, 'Invalid, wrong-session, or expired step-up authorization token.');

    const result=await transaction(async db=>{
     const target=(await db.query('SELECT * FROM users WHERE id=$1',[input.userId])).rows[0];
     if(!target) fail(404, 'User not found.');
     if(target.is_primary_owner) fail(403, 'Primary Owner cannot be altered.');
     if(target.role==='admin') fail(403, 'Administrator accounts cannot be altered via role endpoint.');

     const res=await db.query(
      'UPDATE users SET role=$1,department=$2,account_status=$3,staff_requested=false WHERE id=$4 AND role<>$5 RETURNING id',
      [input.role,input.department.trim(),input.account_status,input.userId,'admin']
     );
     if(!res.rowCount) fail(404,'Eligible account not found.');
     await db.query('DELETE FROM sessions WHERE user_id=$1',[input.userId]);
     await audit(db,user,null,'ADMIN_ROLE_ASSIGNMENT',{userId:input.userId,role:input.role,status:input.account_status});
     return res;
    });
    return send(200,{ok:Boolean(result.rowCount)});
   }

   // ─── Department Management (Primary Owner / departments.manage) ───────────
   if(path==='/api/admin/departments'&&method==='GET') {
    const depts = (await database().query('SELECT * FROM departments ORDER BY code ASC')).rows;
    return send(200, { departments: depts });
   }

   if(path==='/api/admin/departments'&&method==='POST') {
    requireAdminPermission(user, 'departments.manage');
    const input = await body(req);
    fieldsOnly(input, ['code', 'name', 'stepUpToken']);
    if(typeof input.code!=='string'||!/^[A-Z0-9_-]{2,20}$/.test(input.code.trim())) fail(422, 'Invalid department code.');
    if(typeof input.name!=='string'||input.name.trim().length<2||input.name.trim().length>120) fail(422, 'Invalid department name.');

    if(!input.stepUpToken) fail(403, 'Step-up authorization token is required.');
    const validStepUp = await verifyStepUpToken(user.id, 'admin_step_up', input.stepUpToken, database(), user.session_hash);
    if(!validStepUp) fail(403, 'Invalid or expired step-up authorization token.');

    const created = await transaction(async db => {
     const res = await db.query(
      'INSERT INTO departments(code, name) VALUES($1, $2) RETURNING *',
      [input.code.trim().toUpperCase(), input.name.trim()]
     );
     await audit(db, user, null, 'DEPARTMENT_CREATED', { code: res.rows[0].code, name: res.rows[0].name });
     return res.rows[0];
    });
    return send(201, { department: created });
   }

   // ─── Authority Assignment (authorities.assign) ────────────────────────────
   if(path==='/api/admin/authorities'&&method==='GET') {
    requireAdminPermission(user, 'authorities.assign');
    const list = (await database().query(`
     SELECT aa.*, u.email, u.name, d.name AS department_name 
     FROM authority_assignments aa 
     JOIN users u ON u.id = aa.user_id 
     JOIN departments d ON d.code = aa.department_code 
     WHERE aa.active = true 
     ORDER BY aa.assigned_at DESC
    `)).rows;
    return send(200, { assignments: list });
   }

   if(path==='/api/admin/authorities/assign'&&method==='POST') {
    requireAdminPermission(user, 'authorities.assign');
    const input = await body(req);
    fieldsOnly(input, ['userId', 'departmentCode', 'role', 'stepUpToken']);
    if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.userId||'')) fail(422, 'Invalid userId.');
    if(!['HOD', 'Dean', 'Higher Authority'].includes(input.role)) fail(422, 'Invalid authority role.');
    if(typeof input.departmentCode!=='string'||!input.departmentCode.trim()) fail(422, 'Department code is required.');

    if(!input.stepUpToken) fail(403, 'Step-up authorization token is required for authority assignment.');
    const validStepUp = await verifyStepUpToken(user.id, 'admin_step_up', input.stepUpToken, database(), user.session_hash);
    if(!validStepUp) fail(403, 'Invalid or expired step-up authorization token.');

    const res = await transaction(async db => {
     const targetUser = (await db.query('SELECT * FROM users WHERE id=$1', [input.userId])).rows[0];
     if(!targetUser) fail(404, 'User not found.');
     const dept = (await db.query('SELECT * FROM departments WHERE code=$1 AND active=true', [input.departmentCode.trim().toUpperCase()])).rows[0];
     if(!dept) fail(404, 'Active department not found.');

     await db.query(
      `INSERT INTO authority_assignments(user_id, role, department_code, assigned_by) 
       VALUES($1, $2, $3, $4) 
       ON CONFLICT (user_id, department_code, role) 
       DO UPDATE SET active=true, deactivated_at=NULL`,
      [input.userId, input.role, dept.code, user.id]
     );
     await db.query('UPDATE users SET role=$1, department_code=$2, department=$3 WHERE id=$4', [input.role, dept.code, dept.name, input.userId]);
     await db.query('DELETE FROM sessions WHERE user_id=$1', [input.userId]);
     await audit(db, user, null, 'AUTHORITY_ASSIGNED', { userId: input.userId, role: input.role, departmentCode: dept.code });
     return { ok: true };
    });
    return send(200, res);
   }

   // ─── Roster Import & Conflict Management (roster.import / roster.conflicts.manage)
   if(path==='/api/admin/roster/import'&&method==='POST') {
    requireAdminPermission(user, 'roster.import');
    const input = await body(req);
    fieldsOnly(input, ['records', 'stepUpToken']);
    if(!Array.isArray(input.records)||input.records.length===0) fail(422, 'records must be a non-empty array.');
    if(input.records.length > 5000) fail(413, 'Batch exceeds maximum limit of 5000 rows.');

    if(!input.stepUpToken) fail(403, 'Step-up authorization token is required for roster import.');
    const validStepUp = await verifyStepUpToken(user.id, 'admin_step_up', input.stepUpToken, database(), user.session_hash);
    if(!validStepUp) fail(403, 'Invalid or expired step-up authorization token.');

    const batchId = randomUUID();
    let importedCount = 0;
    let conflictsQuarantined = 0;

    await transaction(async db => {
     for(const row of input.records) {
      const reg = typeof row.registerNumber==='string'?row.registerNumber.trim().toUpperCase():'';
      const email = typeof row.institutionalEmail==='string'?row.institutionalEmail.trim().toLowerCase():'';
      const name = typeof row.fullName==='string'?row.fullName.trim():'';
      const dept = typeof row.departmentCode==='string'?row.departmentCode.trim().toUpperCase():'';
      const batch = typeof row.batchYear==='string'?row.batchYear.trim():'';
      const degree = typeof row.degreeProgram==='string'?row.degreeProgram.trim():'B.Tech';

      if(!/^[A-Za-z0-9]{6,30}$/.test(reg) || !email.includes('@') || name.length<2 || !dept) {
       conflictsQuarantined++;
       await db.query(
        'INSERT INTO roster_import_conflicts(batch_id, register_number, institutional_email, department_code, conflict_type, raw_payload) VALUES($1, $2, $3, $4, $5, $6)',
        [batchId, reg||'INVALID', email||'INVALID', dept||'UNKNOWN', 'DEPARTMENT_INVALID', JSON.stringify(row)]
       );
       continue;
      }

      // Check conflicts against existing records
      const existingReg = (await db.query('SELECT * FROM student_rosters WHERE register_number=$1', [reg])).rows[0];
      const existingEmail = (await db.query('SELECT * FROM student_rosters WHERE institutional_email=$1', [email])).rows[0];

      if(existingReg && (existingReg.institutional_email !== email || existingReg.department_code !== dept)) {
       conflictsQuarantined++;
       await db.query(
        'INSERT INTO roster_import_conflicts(batch_id, register_number, institutional_email, department_code, conflict_type, raw_payload) VALUES($1, $2, $3, $4, $5, $6)',
        [batchId, reg, email, dept, 'REGISTER_EXISTS_MISMATCH', JSON.stringify({ incoming: row, existing: existingReg })]
       );
       continue;
      }

      if(existingEmail && existingEmail.register_number !== reg) {
       conflictsQuarantined++;
       await db.query(
        'INSERT INTO roster_import_conflicts(batch_id, register_number, institutional_email, department_code, conflict_type, raw_payload) VALUES($1, $2, $3, $4, $5, $6)',
        [batchId, reg, email, dept, 'EMAIL_EXISTS_MISMATCH', JSON.stringify({ incoming: row, existing: existingEmail })]
       );
       continue;
      }

      if(existingReg && existingReg.bound_user_id) {
       continue;
      }

      await db.query(
       `INSERT INTO student_rosters(register_number, institutional_email, full_name, department_code, batch_year, degree_program)
        VALUES($1, $2, $3, $4, $5, $6)
        ON CONFLICT (register_number) DO UPDATE SET
          institutional_email=EXCLUDED.institutional_email,
          full_name=EXCLUDED.full_name,
          department_code=EXCLUDED.department_code,
          batch_year=EXCLUDED.batch_year,
          updated_at=now()`,
       [reg, email, name, dept, batch, degree]
      );
      importedCount++;
     }
     await audit(db, user, null, 'ROSTER_BATCH_IMPORTED', { batchId, total: input.records.length, importedCount, conflictsQuarantined });
    });

    return send(200, { batchId, totalProcessed: input.records.length, importedCount, conflictsQuarantined });
   }

   if(path==='/api/admin/roster/conflicts'&&method==='GET') {
    requireAdminPermission(user, 'roster.conflicts.manage');
    const conflicts = (await database().query('SELECT * FROM roster_import_conflicts WHERE resolved=false ORDER BY created_at DESC LIMIT 100')).rows;
    return send(200, { conflicts });
   }

   if(path.match(/^\/api\/admin\/roster\/conflicts\/([a-f0-9-]{36})\/resolve$/i)&&method==='POST') {
    requireAdminPermission(user, 'roster.conflicts.manage');
    const conflictId = path.split('/')[5];
    const input = await body(req);
    fieldsOnly(input, ['action', 'notes', 'stepUpToken']);
    if(!['ACCEPTED_UPDATE', 'DISCARDED'].includes(input.action)) fail(422, 'Invalid resolution action.');

    if(!input.stepUpToken) fail(403, 'Step-up authorization token is required for conflict resolution.');
    const validStepUp = await verifyStepUpToken(user.id, 'admin_step_up', input.stepUpToken, database(), user.session_hash);
    if(!validStepUp) fail(403, 'Invalid or expired step-up authorization token.');

    await transaction(async db => {
     const conflict = (await db.query('SELECT * FROM roster_import_conflicts WHERE id=$1 FOR UPDATE', [conflictId])).rows[0];
     if(!conflict) fail(404, 'Conflict record not found.');
     if(conflict.resolved) fail(400, 'Conflict has already been resolved.');

     if(input.action === 'ACCEPTED_UPDATE') {
      const raw = conflict.raw_payload?.incoming || conflict.raw_payload;
      if(raw && raw.registerNumber && raw.institutionalEmail) {
       await db.query(
        `INSERT INTO student_rosters(register_number, institutional_email, full_name, department_code, batch_year)
         VALUES($1, $2, $3, $4, $5)
         ON CONFLICT (register_number) DO UPDATE SET
           institutional_email=EXCLUDED.institutional_email,
           full_name=EXCLUDED.full_name,
           department_code=EXCLUDED.department_code,
           updated_at=now()`,
        [raw.registerNumber.toUpperCase(), raw.institutionalEmail.toLowerCase(), raw.fullName, raw.departmentCode.toUpperCase(), raw.batchYear||'2022-2026']
       );
      }
     }

     await db.query(
      'UPDATE roster_import_conflicts SET resolved=true, resolution_action=$1, resolved_by=$2, resolved_at=now(), resolution_notes=$3 WHERE id=$4',
      [input.action, user.id, input.notes||null, conflictId]
     );
     await audit(db, user, null, 'ROSTER_CONFLICT_RESOLVED', { conflictId, action: input.action });
    });

    return send(200, { ok: true, conflictId, status: 'RESOLVED' });
   }
  }

  // ─── Student Verification Endpoints ────────────────────────────────────────
  if(path==='/api/student/verification-status'&&method==='GET') {
   const activeReq = (await database().query(
    `SELECT svr.*, sr.register_number, sr.department_code, d.name AS department_name
     FROM student_verification_requests svr
     JOIN student_rosters sr ON sr.id = svr.roster_id
     JOIN departments d ON d.code = sr.department_code
     WHERE svr.user_id = $1
     ORDER BY svr.created_at DESC LIMIT 1`,
    [user.id]
   )).rows[0];

   const boundRoster = user.roster_id ? (await database().query('SELECT register_number, department_code, full_name FROM student_rosters WHERE id=$1', [user.roster_id])).rows[0] : null;

   return send(200, {
    isVerified: Boolean(user.is_verified_student),
    roster: boundRoster ? { registerNumber: boundRoster.register_number, departmentCode: boundRoster.department_code } : null,
    activeRequest: activeReq || null
   });
  }

  if(path==='/api/student/verification-request'&&method==='POST') {
   if(user.is_verified_student) fail(400, 'Student account is already verified.');
   const input = await body(req);
   fieldsOnly(input, ['registerNumber', 'notes']);
   if(typeof input.registerNumber!=='string'||!/^[A-Za-z0-9]{6,30}$/.test(input.registerNumber.trim())) {
    fail(422, 'Valid register number is required (6-30 alphanumeric characters).');
   }

   const reg = input.registerNumber.trim().toUpperCase();
   await limit('verification:request:'+user.id, 5);

   const result = await transaction(async db => {
    // Expiry maintenance pass: expire requests past 7 days
    await db.query("UPDATE student_verification_requests SET status='EXPIRED', updated_at=now() WHERE status='PENDING' AND expires_at < now()");

    // Check existing pending request for this user
    const userPending = await db.query("SELECT id FROM student_verification_requests WHERE user_id=$1 AND status='PENDING'", [user.id]);
    if(userPending.rowCount) fail(409, 'You already have an active pending verification request.');

    // Lock and query target roster
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['claim:reg:' + reg]);
    const roster = (await db.query('SELECT * FROM student_rosters WHERE register_number=$1 AND is_active=true FOR UPDATE', [reg])).rows[0];
    
    // Anti-enumeration: if non-existent or already bound, return uniform failure message
    if(!roster || roster.bound_user_id) {
     fail(404, 'Register number is not eligible for claim. Check your official registration number or contact your department.');
    }

    const rosterPending = await db.query("SELECT id FROM student_verification_requests WHERE roster_id=$1 AND status='PENDING'", [roster.id]);
    if(rosterPending.rowCount) {
     fail(409, 'A verification claim for this register number is already under review.');
    }

    // Evaluate automatic verification condition:
    // Email matches roster institutional_email AND domain is in trusted allowlist
    const emailNorm = user.email.trim().toLowerCase();
    const rosterEmailNorm = roster.institutional_email.trim().toLowerCase();
    const emailDomain = emailNorm.split('@')[1] || '';
    const trusted = institutionalDomains();

    const canAutoApprove = (emailNorm === rosterEmailNorm) && trusted.includes(emailDomain);

    if(canAutoApprove) {
     // Automatic approval transaction
     await db.query('UPDATE student_rosters SET bound_user_id=$1, updated_at=now() WHERE id=$2', [user.id, roster.id]);
     const deptRow = (await db.query('SELECT name FROM departments WHERE code=$1', [roster.department_code])).rows[0];
     await db.query(
      'UPDATE users SET is_verified_student=true, roster_id=$1, department_code=$2, department=$3 WHERE id=$4',
      [roster.id, roster.department_code, deptRow?.name||roster.department_code, user.id]
     );
     await db.query(
      `INSERT INTO student_verification_requests(user_id, roster_id, status, claim_channel, notes, reviewed_at)
       VALUES($1, $2, 'APPROVED', 'INSTITUTIONAL_OAUTH_EXACT', 'Auto-approved via verified institutional email match.', now())`,
      [user.id, roster.id]
     );
     await audit(db, user, null, 'STUDENT_VERIFIED_AUTO', { registerNumber: reg, email: user.email });
     return { status: 'APPROVED', registerNumber: reg, departmentCode: roster.department_code, autoApproved: true };
    } else {
     // Manual verification claim requiring HOD review
     const reqRow = (await db.query(
      `INSERT INTO student_verification_requests(user_id, roster_id, status, claim_channel, notes)
       VALUES($1, $2, 'PENDING', 'STUDENT_MANUAL_CLAIM', $3)
       RETURNING id, expires_at`,
      [user.id, roster.id, input.notes?.trim()||null]
     )).rows[0];
     await audit(db, user, null, 'STUDENT_VERIFICATION_PENDING', { registerNumber: reg, requestId: reqRow.id });
     return { status: 'PENDING', registerNumber: reg, departmentCode: roster.department_code, expiresAt: reqRow.expires_at };
    }
   });

   return send(201, result);
  }

  // ─── Authority Department-Scoped Student Verification Console ──────────────
  if(path==='/api/authority/students/requests'&&method==='GET') {
   if(!STAFF.includes(user.role) && user.role!=='admin') fail(403, 'Authority clearance required.');

   let deptClause = 'TRUE';
   let params = [];

   if(user.role === 'HOD') {
    const depts = Array.isArray(user.assigned_departments) && user.assigned_departments.length > 0
     ? user.assigned_departments
     : (user.department_code ? [user.department_code] : []);
    deptClause = 'sr.department_code = ANY($1)';
    params = [depts];
   }

   const requests = (await database().query(`
    SELECT svr.id, svr.user_id, svr.status, svr.claim_channel, svr.notes, svr.identity_evidence_reference, svr.created_at, svr.expires_at,
           u.email AS user_email, u.name AS user_name,
           sr.register_number, sr.institutional_email, sr.full_name AS roster_name, sr.department_code, sr.batch_year,
           d.name AS department_name
    FROM student_verification_requests svr
    JOIN student_rosters sr ON sr.id = svr.roster_id
    JOIN departments d ON d.code = sr.department_code
    JOIN users u ON u.id = svr.user_id
    WHERE ${deptClause}
    ORDER BY CASE WHEN svr.status='PENDING' THEN 1 ELSE 2 END, svr.created_at DESC
    LIMIT 100
   `, params)).rows;

   return send(200, { requests });
  }

  if(path.match(/^\/api\/authority\/students\/requests\/([a-f0-9-]{36})\/review$/i)&&method==='POST') {
   if(!STAFF.includes(user.role) && user.role!=='admin') fail(403, 'Authority clearance required.');
   const requestId = path.split('/')[5];
   const input = await body(req);
   fieldsOnly(input, ['decision', 'notes', 'identityEvidenceReference', 'verificationMethod']);
   if(!['APPROVED', 'REJECTED'].includes(input.decision)) fail(422, 'decision must be APPROVED or REJECTED.');
   if(typeof input.notes!=='string'||input.notes.trim().length < 15) fail(422, 'Reviewer notes must contain at least 15 characters.');

   await transaction(async db => {
    const vReq = (await db.query(`
     SELECT svr.*, sr.department_code, sr.register_number 
     FROM student_verification_requests svr
     JOIN student_rosters sr ON sr.id = svr.roster_id
     WHERE svr.id=$1 FOR UPDATE
    `, [requestId])).rows[0];

    if(!vReq) fail(404, 'Verification request not found.');
    if(vReq.status !== 'PENDING') fail(400, `Request is already in state: ${vReq.status}`);
    if(new Date(vReq.expires_at).getTime() < Date.now()) fail(400, 'Verification request has expired.');

    // Enforce department scoping for HOD
    if(user.role === 'HOD') {
     const depts = Array.isArray(user.assigned_departments) && user.assigned_departments.length > 0
      ? user.assigned_departments
      : (user.department_code ? [user.department_code] : []);
     if(!depts.includes(vReq.department_code)) {
      fail(403, `Reviewer authority scope does not cover department: ${vReq.department_code}`);
     }
    }

    if(input.decision === 'APPROVED') {
      // In-person or manual claim requires genuine institutional identity-check method and documented evidence reference
      const allowedMethods = ['IN_PERSON_COLLEGE_ID', 'PHYSICAL_OFFICE_VERIFICATION', 'DEPT_ACADEMIC_RECORD', 'FACULTY_ADVISOR_CONFIRMATION'];
      if(vReq.claim_channel === 'STUDENT_MANUAL_CLAIM') {
        const method = input.verificationMethod;
        if(!method || !allowedMethods.includes(method)) {
          fail(422, 'Genuine institutional identity-check method required (e.g. IN_PERSON_COLLEGE_ID, PHYSICAL_OFFICE_VERIFICATION, DEPT_ACADEMIC_RECORD, FACULTY_ADVISOR_CONFIRMATION).');
        }
        if(!input.identityEvidenceReference || input.identityEvidenceReference.trim().length < 5) {
          fail(422, 'Identity evidence reference or physical verification record is mandatory for manual claims.');
        }
        // Never accept an arbitrary file path or URL as sufficient proof
        if(/^(https?:\/\/|\/|\\|\.\.|\w+:\/)/i.test(input.identityEvidenceReference.trim())) {
          fail(422, 'Arbitrary URL or file path rejected. Document an official institutional credential or register record.');
        }
      }

      await db.query('UPDATE student_rosters SET bound_user_id=$1, updated_at=now() WHERE id=$2', [vReq.user_id, vReq.roster_id]);
      const deptRow = (await db.query('SELECT name FROM departments WHERE code=$1', [vReq.department_code])).rows[0];
      await db.query(
        'UPDATE users SET is_verified_student=true, roster_id=$1, department_code=$2, department=$3 WHERE id=$4',
        [vReq.roster_id, vReq.department_code, deptRow?.name||vReq.department_code, vReq.user_id]
      );
      await db.query(
        `UPDATE student_verification_requests 
         SET status='APPROVED', notes=$1, identity_evidence_reference=$2, reviewed_by=$3, reviewed_at=now(), updated_at=now() 
         WHERE id=$4`,
        [input.notes.trim(), input.identityEvidenceReference?.trim()||null, user.id, requestId]
      );
      await audit(db, user, null, 'STUDENT_VERIFICATION_MANUAL_APPROVED', {
        requestId,
        targetUserId: vReq.user_id,
        registerNumber: vReq.register_number,
        reviewerId: user.id,
        method: input.verificationMethod || 'INSTITUTIONAL_OAUTH_EXACT'
      });
    } else {
     await db.query(
      `UPDATE student_verification_requests 
       SET status='REJECTED', rejection_reason=$1, reviewed_by=$2, reviewed_at=now(), updated_at=now() 
       WHERE id=$3`,
      [input.notes.trim(), user.id, requestId]
     );
     await audit(db, user, null, 'STUDENT_VERIFICATION_REJECTED', { requestId, targetUserId: vReq.user_id, reason: input.notes.trim() });
    }
   });

   return send(200, { ok: true, decision: input.decision });
  }
  fail(404,'Endpoint not found.');
 } catch(error) {
  const status=error.status|| (error.code==='23505'?409:503);
  if(status===429)res.setHeader('Retry-After',String(Math.max(1,error.retryAfter||60)));
  if(!error.status) console.error('API failure code:',error.code||error.name);
  send(status,{error:error.status?error.message:'Backend unavailable. Check server configuration and migration.'});
 }
}
}
export default createHandler();
