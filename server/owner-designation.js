import {fail} from './policy.js';

// Pure planning only. No account creation, activation, or PIN assignment.
export function ownerDesignationPlan(candidate,owners,{userId,email,googleSubject}) {
 if(!userId || !email || !googleSubject) fail(422,'Explicit owner ID, email and verified Google subject are required.');
 if(!candidate || candidate.id!==userId || candidate.email?.toLowerCase()!==email.toLowerCase() || candidate.google_subject_id!==googleSubject) fail(403,'Owner candidate verification failed.');
 if(candidate.account_status!=='active') fail(403,'Owner candidate must be active.');
 if(owners.some(owner=>owner.id!==userId)) fail(409,'A different Primary Owner already exists.');
 return {
  userId:candidate.id,email:candidate.email,alreadyDesignated:Boolean(candidate.is_primary_owner),
  mfaEnrolled:Boolean(candidate.mfa_enrolled),pinSet:Boolean(candidate.action_pin_hash),
  approvalRequired:true,
  nextSteps:['Obtain separate approval for designation.','Use a verified production operator connection and match this exact candidate.','Revoke existing sessions and audit the designation in the same transaction.','Owner signs in again, enrolls TOTP if needed, and chooses their PIN through emailed verification.'],
 };
}
