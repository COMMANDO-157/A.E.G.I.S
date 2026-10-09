export const STAFF=['HOD','Dean','Higher Authority'];
export function fail(status,message) { throw Object.assign(new Error(message),{status}); }
export function active(user) { if (!user || user.account_status!=='active') fail(401,'Sign in with an active account.'); }
export function canRead(user,complaint) {
 if (!user || user.account_status!=='active') return false;
 if(user.role==='student') return complaint.owner_user_id===user.id;
 if(user.role==='admin'||user.role==='Higher Authority') return true;
 return STAFF.includes(user.role) && complaint.assigned_authority===user.role && complaint.department===user.department;
}
export function canAct(user,complaint) { return STAFF.includes(user?.role) && canRead(user,complaint); }
export function requireAdmin(user) { active(user); if(user.role!=='admin') fail(403,'Administrator access required.'); }
export const REVIEW_TRANSITIONS={
 Submitted:['Identity Verified'], 'Identity Verified':['Evidence Pending','Under Review'],
 'Evidence Pending':['Under Review'], 'Under Review':['Additional Information Requested','Findings Recorded'],
 'Additional Information Requested':['Under Review'], 'Findings Recorded':['Resolved'], Resolved:[]
};
export function reviewDecision(user,complaint,input) {
 fieldsOnly(input,['verification_status','notes','evidence_status','allegation_status']);
 if(!canAct(user,complaint)) fail(403,'Approved assigned authority required.');
 if(!(REVIEW_TRANSITIONS[complaint.verification_status]||[]).includes(input.verification_status)) fail(422,'Invalid verification transition.');
 if(typeof input.notes!=='string'||input.notes.trim().length<15||input.notes.length>10000) fail(422,'Supporting reasons must contain at least 15 characters.');
 if(input.evidence_status!==undefined && !['Pending','Authenticity Confirmed','Inconclusive'].includes(input.evidence_status)) fail(422,'Invalid evidence decision.');
 if(input.allegation_status!==undefined && !['Unreviewed','Substantiated','Not Substantiated','Inconclusive'].includes(input.allegation_status)) fail(422,'Invalid findings.');
 if(input.allegation_status && input.verification_status!=='Findings Recorded') fail(422,'Allegation findings require the Findings Recorded step.');
 if(input.verification_status==='Findings Recorded' && (!input.allegation_status || input.allegation_status==='Unreviewed')) fail(422,'Record a human finding, including Inconclusive where appropriate.');
}
export function safeComplaint(c) {
 const keys=['id','reference_id','case_id','category','description','severity','urgency','assigned_authority','status','verification_status','identity_status','evidence_status','allegation_status','identity_mode','created_at','updated_at'];
 return Object.fromEntries(keys.map(key=>[key,c[key]]));
}
export function fieldsOnly(body,allowed) {
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!allowed.includes(key))) fail(422,'Unexpected request fields.');
}
