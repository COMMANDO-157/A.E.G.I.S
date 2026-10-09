import {randomUUID} from 'node:crypto';
import {intakeEnabled} from './config.js';
import {database,transaction} from './db.js';
import {challenge,login,sessionUser,logout,checkOrigin,configured} from './auth.js';
import {fail,canRead,canAct,requireAdmin,reviewDecision,safeComplaint,fieldsOnly,STAFF} from './policy.js';
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
function userView(u) { return {id:u.id,email:u.email,name:u.name,department:u.department,role:u.role,account_status:u.account_status,staff_requested:u.staff_requested}; }
export function createHandler(auth={sessionUser,logout},store={database,transaction}) {
 const {database,transaction}=store;
 return async function handler(req,res) {
 res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
 const send=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
 try {
  const url=new URL(req.url,'http://localhost');
  const path='/api/'+(url.searchParams.get('route')||url.pathname.replace(/^\/api\/?/,'')).replace(/^\/|\/$/g,'');
  const method=req.method;
  if(method==='GET'&&path==='/api/config') return send(200,{ready:intakeEnabled(),configured:configured(),googleClientId:intakeEnabled()?process.env.GOOGLE_CLIENT_ID:null});
  if(!['GET','HEAD'].includes(method)) {
   checkOrigin(req);
   if(!String(req.headers['content-type']||'').startsWith('application/json')) fail(415,'JSON requests required.');
  }
  if(path==='/api/auth/logout'&&method==='POST') {await auth.logout(req,res);return send(200,{ok:true});}
  if(!intakeEnabled()) fail(503,'Authenticated intake is disabled pending integration and security verification.');
  if(path==='/api/auth/challenge'&&method==='POST') return send(200,await challenge(res));
  if(path==='/api/auth/google'&&method==='POST') {const input=await body(req);fieldsOnly(input,['credential']);return send(200,{user:userView(await login(req,res,input.credential))});}
  const user=await auth.sessionUser(req);
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
     caseId=linked.rows[0].case_id;
    }
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[caseId]);
    const existing=await db.query('SELECT * FROM complaints WHERE case_id=$1 FOR UPDATE',[caseId]);
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
   const updated=await transaction(async db=>{
    const locked=await db.query('SELECT * FROM complaints WHERE id=$1 FOR UPDATE',[match[1]]);
    const c=locked.rows[0];if(!c||!canRead(user,c)) fail(404,'Complaint not found.');
    if(!canAct(user,c)) fail(403,'Approved assigned authority required.');
    if(match[2]==='status') {
     fieldsOnly(input,['status','notes']);
     const valid=validateStatusTransition({status:c.status,assignedAuthority:c.assigned_authority},input.status,input.notes,user.role);
     if(!valid.valid) fail(422,valid.error);
     await db.query('UPDATE complaints SET status=$1,updated_at=now() WHERE id=$2',[input.status,c.id]);
     await audit(db,user,c.id,'STATUS_UPDATE',{status:input.status});
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
      const evidence=await db.query('SELECT id FROM complaint_evidence WHERE complaint_id=$1',[c.id]);
      if(!evidence.rowCount) fail(422,'No privately stored evidence is available to authenticate.');
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
   if(path==='/api/admin/users'&&method==='GET') return send(200,{users:(await database().query('SELECT id,email,name,department,role,account_status,staff_requested FROM users ORDER BY created_at DESC LIMIT 100')).rows});
   if(path==='/api/admin/audit'&&method==='GET') return send(200,{logs:(await database().query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100')).rows});
   if(path==='/api/admin/roles'&&method==='PATCH') {
    const input=await body(req);fieldsOnly(input,['userId','role','department','account_status']);
    if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.userId||'')||input.department?.length>120||input.userId===user.id||!['student',...STAFF].includes(input.role)||!['active','suspended'].includes(input.account_status)||typeof input.department!=='string'||!input.department.trim()) fail(422,'Invalid role assignment. Admin grants require trusted bootstrap.');
    const result=await transaction(async db=>{
     const result=await db.query('UPDATE users SET role=$1,department=$2,account_status=$3,staff_requested=false WHERE id=$4 AND role<>$5 RETURNING id',[input.role,input.department.trim(),input.account_status,input.userId,'admin']);
     if(!result.rowCount) fail(404,'Eligible account not found.');
     await db.query('DELETE FROM sessions WHERE user_id=$1',[input.userId]);
     await audit(db,user,null,'ADMIN_ROLE_ASSIGNMENT',{userId:input.userId,role:input.role,status:input.account_status});return result;
    });return send(200,{ok:Boolean(result.rowCount)});
   }
  }
  fail(404,'Endpoint not found.');
 } catch(error) {
  const status=error.status|| (error.code==='23505'?409:503);
  if(!error.status) console.error('API failure code:',error.code||error.name);
  send(status,{error:error.status?error.message:'Backend unavailable. Check server configuration and migration.'});
 }
}
}
export default createHandler();
