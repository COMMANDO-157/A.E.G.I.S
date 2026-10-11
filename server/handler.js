import {randomUUID} from 'node:crypto';
import {consumeRateLimit} from './rate-limit.js';
import {authorizeMaintenance,cleanupExpired} from './maintenance.js';
import {runEscalationCycle} from './escalation-worker.js';
import {cookie} from './auth.js';
import {intakeEnabled} from './config.js';
import {database,transaction} from './db.js';
import {challenge,login,sessionUser,logout,checkOrigin,configured,issueStepUpToken,verifyStepUpToken} from './auth.js';
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
  hashRecoveryCode
} from './crypto.js';
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
  role:u.role,
  account_status:u.account_status,
  staff_requested:u.staff_requested,
  is_primary_owner:Boolean(u.is_primary_owner),
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
  const limit=(bucket,max)=>security.consumeRateLimit(database(),bucket,max);
  if(path==='/api/maintenance'&&method==='GET'){
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
  await limit('session:global',1200);
  const user=await auth.sessionUser(req);
  await limit('user:'+user.id+':'+(method==='GET'?'read':'write'),method==='GET'?240:30);
  if(path==='/api/me'&&method==='GET') return send(200,{user:userView(user)});

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
  if(path==='/api/complaints'&&method==='GET') {
   let clause,values;
   if(user.role==='student'){clause='owner_user_id=$1';values=[user.id];}
   else if(['Higher Authority','admin'].includes(user.role)){clause='TRUE';values=[];}
   else if(STAFF.includes(user.role)){clause='assigned_authority=$1 AND department=$2';values=[user.role,user.department];}
   else fail(403,'Approved role required.');
   const result=await database().query('SELECT * FROM complaints WHERE '+clause+' ORDER BY created_at DESC LIMIT 100',values);
   return send(200,{complaints:result.rows.map(safeComplaint)});
  }
  if(path==='/api/complaints'&&method==='POST') {
   if(!intakeEnabled()) fail(503,'Live intake is temporarily paused pending verification.');
   if(user.role!=='student') fail(403,'Student account required.');
   if(!user.department) fail(422,'Save your department first.');
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
      fail(422,'Private evidence review is not configured; authenticity cannot be confirmed.');
     }
     await db.query('UPDATE complaints SET verification_status=$1,evidence_status=$2,allegation_status=$3,updated_at=now() WHERE id=$4',
      [input.verification_status,input.evidence_status||c.evidence_status,input.allegation_status||c.allegation_status,c.id]);
     await db.query('INSERT INTO verification_reviews(complaint_id,reviewer_id,decision,notes) VALUES($1,$2,$3,$4)',[c.id,user.id,input.verification_status,input.notes.trim()]);
     await audit(db,user,c.id,'HUMAN_VERIFICATION_REVIEW',{decision:input.verification_status});
    } else fail(404,'Endpoint not found.');
    return (await db.query('SELECT * FROM complaints WHERE id=$1',[c.id])).rows[0];
   });return send(200,{complaint:safeComplaint(updated)});
  }
  if(path.startsWith('/api/admin')) {
   requireAdmin(user);

   // ─── MFA Endpoints ────────────────────────────────────────────────────────
   if(path==='/api/admin/mfa/setup'&&method==='POST') {
    await limit('admin:mfa:setup:'+user.id, 10);
    // Generate TOTP secret and return otpauth URL (and plaintext secret for setup only)
    const secret = generateTotpSecret();
    const uri = getTotpUri(secret, user.email, 'A.E.G.I.S');
    const encrypted = encryptSecret(secret);
    const {plaintextCodes, hashedCodes} = generateRecoveryCodes(8);

    await transaction(async db=>{
     // Store encrypted secret in staging or directly with mfa_enrolled=false
     await db.query('UPDATE users SET mfa_secret_encrypted=$1,mfa_enrolled=false WHERE id=$2',[encrypted, user.id]);
     await db.query('DELETE FROM mfa_recovery_codes WHERE user_id=$1',[user.id]);
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

   // ─── General Admin Step-Up Endpoint ─────────────────────────────────────────
   // Verifies either TOTP code or Action PIN and issues an 'admin_step_up' token.
   // Prerequisites: Administrator must have enrolled in TOTP MFA and set 5-digit Action PIN.
   if(path==='/api/admin/step-up'&&method==='POST') {
    requireAdmin(user);
    await limit('admin:stepup:'+user.id, 15);
    const input=await body(req);
    fieldsOnly(input, ['type', 'code', 'pin']);
    const dbUser=(await database().query('SELECT * FROM users WHERE id=$1',[user.id])).rows[0];

    // Enforce dual prerequisites for privileged step-up authorization
    if(!dbUser.mfa_enrolled || !dbUser.mfa_secret_encrypted) {
     fail(403, 'MFA enrollment is a required prerequisite before issuing privileged step-up tokens.');
    }
    if(!dbUser.action_pin_hash || !dbUser.action_pin_salt) {
     fail(403, 'Action PIN setup is a required prerequisite before issuing privileged step-up tokens.');
    }

    if(input.type==='mfa') {
     const secret = decryptSecret(dbUser.mfa_secret_encrypted);
     if(!verifyTotp(input.code, secret)) fail(401, 'Invalid MFA code.');
    } else if(input.type==='pin') {
     if(dbUser.action_pin_locked_until && new Date(dbUser.action_pin_locked_until).getTime() > Date.now()) {
      fail(429, 'Action PIN is locked.');
     }
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
     await database().query('UPDATE users SET action_pin_failed_attempts=0,action_pin_locked_until=NULL WHERE id=$1',[user.id]);
    } else {
     fail(422, 'Step-up type must be "mfa" or "pin".');
    }

    const stepUpToken = await issueStepUpToken(user.id, 'admin_step_up', database(), user.session_hash);
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
