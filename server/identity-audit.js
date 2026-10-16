import {createHmac,randomBytes} from 'node:crypto';

// Pure, read-only analysis. No database connector, filesystem, provider calls or
// classification as fraud. Caller controls evidence custody; output contains no PII.
export function auditIdentityBindings(snapshot,{key=randomBytes(32)}={}) {
 const users=snapshot.users||[],rosters=snapshot.rosters||[],institutions=snapshot.institutions||[],departments=snapshot.departments||[];
 const token=id=>createHmac('sha256',key).update(String(id)).digest('hex').slice(0,20);
 const byId=rows=>new Map(rows.map(r=>[r.id,r]));const userMap=byId(users),rosterMap=byId(rosters),instMap=byId(institutions),deptMap=new Map(departments.map(d=>[d.code,d]));
 const findings=[];const add=(id,code,classification='REVIEW_REQUIRED')=>findings.push({recordToken:token(id),code,classification});
 const groups=new Map();for(const u of users){if(u.google_subject_id){const a=groups.get(u.google_subject_id)||[];a.push(u);groups.set(u.google_subject_id,a);}}
 for(const group of groups.values())if(group.length>1)for(const u of group)add(u.id,'DUPLICATE_GOOGLE_SUBJECT');
 const emails=new Map();for(const u of users){const email=String(u.email||'').trim().toLowerCase();if(email){const group=emails.get(email)||[];group.push(u);emails.set(email,group);}}
 for(const group of emails.values())if(group.length>1)for(const u of group)add(u.id,'DUPLICATE_ACCOUNT_EMAIL');
 const bound=new Map();for(const r of rosters)if(r.bound_user_id){const rows=bound.get(r.bound_user_id)||[];rows.push(r);bound.set(r.bound_user_id,rows);if(!userMap.has(r.bound_user_id))add(r.id,'BOUND_ACCOUNT_MISSING');}
 for(const u of users){
  const linked=bound.get(u.id)||[];if(linked.length>1)add(u.id,'MULTIPLE_ROSTER_BINDINGS');
  const r=rosterMap.get(u.roster_id);
  if(u.roster_id && !r)add(u.id,'REFERENCED_ROSTER_MISSING');
  if((r && r.bound_user_id!==u.id)||linked.some(row=>row.id!==u.roster_id))add(u.id,'NONRECIPROCAL_BINDING');
  if(u.is_verified_student && !r)add(u.id,'VERIFIED_WITHOUT_ROSTER');
  if(!r)continue;
  const inst=instMap.get(r.institution_id),dept=deptMap.get(r.department_code);
  if(!inst)add(u.id,'INSTITUTION_EVIDENCE_MISSING','INSUFFICIENT_EVIDENCE');
  else if(inst.active!==true)add(u.id,'INACTIVE_INSTITUTION');
  if(dept && dept.active===false)add(u.id,'INACTIVE_DEPARTMENT');
  if(!dept || dept.institution_id!==r.institution_id)add(u.id,'DEPARTMENT_INSTITUTION_MISMATCH');
  if(r.is_active!==true||r.is_test_record===true)add(u.id,'INELIGIBLE_ROSTER');
  if(u.department_code && u.department_code!==r.department_code)add(u.id,'ACCOUNT_DEPARTMENT_MISMATCH');
  if(String(u.email||'').trim().toLowerCase()!==String(r.institutional_email||'').trim().toLowerCase())add(u.id,'ALTERNATE_EMAIL_NEEDS_INDEPENDENT_EVIDENCE','INSUFFICIENT_EVIDENCE');
  // A subject column does not preserve historical verified-email claims.
  if(u.google_subject_id)add(u.id,'HISTORICAL_PROVIDER_EMAIL_NOT_ESTABLISHED','INSUFFICIENT_EVIDENCE');
 }
 return {version:1,readOnly:true,findings,notice:'Indicators require independent evidence review; no fraud finding or account action is implied.'};
}
export function syntheticIdentityAuditFixture() {
 return {synthetic:true,users:[{id:'synthetic-a',email:'personal@example.test',google_subject_id:'synthetic-google',is_verified_student:true,roster_id:'synthetic-roster',department_code:'CSE'}],rosters:[{id:'synthetic-roster',bound_user_id:'synthetic-a',institution_id:'synthetic-institution',department_code:'CSE',institutional_email:'campus@campus.example.test',is_active:true,is_test_record:false}],institutions:[{id:'synthetic-institution',active:true}],departments:[{code:'CSE',institution_id:'synthetic-institution'}]};
}
