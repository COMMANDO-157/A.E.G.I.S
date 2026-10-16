export const STAFF=['HOD','Dean','Higher Authority'];
export const DELEGATED_PERMISSIONS=[
  'users.read',
  'users.verify',
  'users.roles.assign',
  'users.suspend',
  'departments.manage',
  'audit.read',
  'authorities.assign',
  'roster.import',
  'roster.conflicts.manage',
  'department.students.verify'
];

export function fail(status,message) { throw Object.assign(new Error(message),{status}); }
export function active(user) { if (!user || user.account_status!=='active') fail(401,'Sign in with an active account.'); }

export function canRead(user,complaint) {
 if (!user || user.account_status!=='active') return false;
 if(user.role==='student') return complaint.owner_user_id===user.id;
 if(user.role==='admin'||user.role==='Higher Authority') return true;
 if(!STAFF.includes(user.role)) return false;

 if(user.role==='Dean') return complaint.assigned_authority==='Dean';

 // Support multi-department appointments via user.assigned_departments or user.authority_assignments
 const depts = Array.isArray(user.assigned_departments) && user.assigned_departments.length > 0
  ? user.assigned_departments
  : (user.department ? [user.department] : []);

 return Boolean(complaint.assigned_authority===user.role && (depts.includes(complaint.department) || (user.department_code && depts.includes(user.department_code))));
}

export function canAct(user,complaint) { return STAFF.includes(user?.role) && canRead(user,complaint); }

export function requireAdmin(user) {
 active(user);
 if(user.role!=='admin') fail(403,'Administrator access required.');
}

/**
 * Checks whether user has a specific delegated permission OR is Primary Owner.
 * Primary Owner administration excludes independent enrollment verification.
 * Delegated admins have only explicitly granted permissions in user.permissions.
 */
export function hasAdminPermission(user, permission) {
 active(user);
 if(user.role!=='admin') return false;
 if(user.is_primary_owner) return permission!=='department.students.verify';
 const perms = Array.isArray(user.permissions) ? user.permissions : [];
 return perms.includes(permission);
}

export function requireAdminPermission(user, permission) {
 requireAdmin(user);
 if(!hasAdminPermission(user, permission)) {
  fail(403, `Missing required administrative permission: ${permission}`);
 }
}

export function requirePrimaryOwner(user) {
 requireAdmin(user);
 if(!user.is_primary_owner) fail(403,'Primary Owner clearance required.');
}

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
