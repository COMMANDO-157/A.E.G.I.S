import {fail} from './policy.js';

export const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export function validateGoogleClaims(payload, clientId, now = Date.now()) {
 if(!clientId || !['accounts.google.com','https://accounts.google.com'].includes(payload?.iss) || payload.aud !== clientId ||
    !Number.isFinite(payload.exp) || payload.exp <= now/1000 || typeof payload.sub !== 'string' || !payload.sub ||
    typeof payload.email !== 'string' || !payload.email.includes('@') || payload.email_verified !== true) {
  fail(401,'Google identity token claims were rejected.');
 }
 return payload;
}

// Called inside the account-link transaction. Linking proves this same email only;
// it never changes enrollment status, email ownership, or an existing subject.
export async function linkConfirmedGoogleAccount(db, userId, payload) {
 await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['google-sub:'+payload.sub]);
 const current=(await db.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[userId])).rows[0];
 if(!current || current.account_status !== 'active') fail(401,'Sign in with an active account.');
 if(normalizeEmail(current.email)!==normalizeEmail(payload.email)) fail(409,'Google email must match the signed-in account. Independent enrollment review is required for a different email.');
 if(current.google_subject_id && current.google_subject_id!==payload.sub) fail(409,'An existing Google identity cannot be replaced through account linking.');
 const others=(await db.query('SELECT id FROM users WHERE (google_subject_id=$1 OR lower(email)=lower($2)) AND id<>$3',[payload.sub,payload.email,userId])).rows;
 if(others.length) fail(409,'Google identity or email has a conflicting account binding.');
 return (await db.query('UPDATE users SET google_subject_id=$1 WHERE id=$2 RETURNING *',[payload.sub,userId])).rows[0];
}

export function requireCurrentClaim(claim, now=Date.now()) {
 const expiry=claim?.expires_at ? new Date(claim.expires_at).getTime() : NaN;
 if(!Number.isFinite(expiry) || expiry<=now) fail(400,'Verification request has expired or has no valid expiry.');
}
export function requireVerificationEvidence(input) {
 const methods=['OWNER_INDEPENDENT_ROSTER_VERIFICATION','IN_PERSON_COLLEGE_ID','PHYSICAL_OFFICE_VERIFICATION','DEPT_ACADEMIC_RECORD','FACULTY_ADVISOR_CONFIRMATION'];
 const method=input.verificationMethod || 'OWNER_INDEPENDENT_ROSTER_VERIFICATION';
 if(!methods.includes(method)) fail(422,'Independent institutional verification method required.');
 const evidence=typeof input.identityEvidenceReference==='string' ? input.identityEvidenceReference.trim() : '';
 if(evidence.length<5 || evidence.length>500 || /^(https?:\/\/|\/|\\|\.\.|\w+:[\\/])/i.test(evidence)) fail(422,'Official institutional identity evidence reference is required; arbitrary URLs and file paths are not evidence.');
 return {method,evidence};
}
