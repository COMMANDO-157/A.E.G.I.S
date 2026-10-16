import {active,fail} from './policy.js';

const denied=()=>fail(403,'Independent verification authority is unavailable for this request.');
const time=value=>value==null?NaN:new Date(value).getTime();
const current=(row,now)=>row && row.revoked_at===null && Number.isFinite(time(row.starts_at)) && time(row.starts_at)<=now && Number.isFinite(time(row.expires_at)) && time(row.expires_at)>now;

// Existing admin endpoints are only a compatibility transport. A title or Owner
// flag cannot substitute for independently recorded appointment and clearance.
export function requireVerificationPrincipal(actor) {
 active(actor);
 if(actor.role!=='admin'||actor.is_primary_owner||actor.has_academic_authority_assignment) denied();
}
export function selectVerificationAppointment(actor,claim,appointments,now=Date.now()) {
 requireVerificationPrincipal(actor);
 if(!claim?.id||!claim.institution_id||!claim.department_code||!claim.batch_year||actor.id===claim.user_id) denied();
 const eligible=appointments.filter(a=>a.officer_user_id===actor.id && current(a,now) && a.institution_id===claim.institution_id && a.department_code===claim.department_code && a.cohort===claim.batch_year && a.appointed_by && a.appointed_by!==actor.id && typeof a.appointment_reference==='string' && a.appointment_reference.trim().length>=5);
 if(eligible.length!==1) denied(); // overlapping authority is unresolved, never silently selected
 return eligible[0];
}
export function evaluateVerificationAuthority(actor,claim,appointments,clearance,now=Date.now()) {
 const appointment=selectVerificationAppointment(actor,claim,appointments,now);
 if(!clearance?.id || clearance.appointment_id!==appointment.id || clearance.request_id!==claim.id || clearance.status!=='CLEARED' || !current(clearance,now) || !clearance.recorded_by || [actor.id,claim.user_id].includes(clearance.recorded_by) || typeof clearance.clearance_reference!=='string' || clearance.clearance_reference.trim().length<5) denied();
 return {appointmentId:appointment.id,clearanceId:clearance.id};
}
async function principal(db,actorId,lock) {
 const actor=(await db.query('SELECT * FROM users WHERE id=$1'+(lock?' FOR SHARE':''),[actorId])).rows[0];
 requireVerificationPrincipal(actor);
 // Re-read authoritative permission. Session claims and Owner inheritance do not count.
 const permission=await db.query("SELECT id FROM admin_permissions WHERE user_id=$1 AND permission='department.students.verify'"+(lock?' FOR SHARE':''),[actorId]);
 if(!permission.rowCount) denied();
 const schema=(await db.query("SELECT to_regclass('public.verification_officer_appointments') IS NOT NULL AND to_regclass('public.verification_conflict_clearances') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.verification_officer_appointments') AND tgname='verification_appointment_change_lock' AND tgenabled IN ('O','A')) AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.verification_conflict_clearances') AND tgname='verification_clearance_change_lock' AND tgenabled IN ('O','A')) AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.authority_assignments') AND tgname='verification_academic_assignment_change_lock' AND tgenabled IN ('O','A')) AS available")).rows[0];
 if(schema?.available!==true) denied();
 return actor;
}
// The user row lock precedes the actor lock, matching existing role-management writes.
// Read academic assignments after acquiring the actor lock so a preceding mutation
// cannot leave a stale conflict result. Caller must use one database transaction.
async function lockedPrincipal(db,actorId) {
 const actor=await principal(db,actorId,true);
 await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['verification-authority:'+actorId]);
 const assignments=await db.query("SELECT id FROM authority_assignments WHERE user_id=$1 AND active=true AND role IN ('HOD','Dean','Higher Authority')",[actorId]);
 actor.has_academic_authority_assignment=assignments.rowCount>0;
 requireVerificationPrincipal(actor);
 return actor;
}
export async function requireVerificationDecision(db,actorId,claim) {
 const actor=await lockedPrincipal(db,actorId);
 const appointments=(await db.query('SELECT * FROM verification_officer_appointments WHERE officer_user_id=$1',[actorId])).rows;
 let now=new Date((await db.query('SELECT clock_timestamp() AS now')).rows[0].now).getTime();
 const selected=selectVerificationAppointment(actor,claim,appointments,now);
 const clearance=(await db.query('SELECT * FROM verification_conflict_clearances WHERE appointment_id=$1 AND request_id=$2',[selected.id,claim.id])).rows[0];
 now=new Date((await db.query('SELECT clock_timestamp() AS now')).rows[0].now).getTime();
 return evaluateVerificationAuthority(actor,claim,appointments,clearance,now);
}
export async function verificationQueueIds(db,actorId) {
 await lockedPrincipal(db,actorId);
 return (await db.query(`SELECT DISTINCT c.request_id FROM verification_conflict_clearances c
 JOIN verification_officer_appointments a ON a.id=c.appointment_id
 JOIN student_verification_requests v ON v.id=c.request_id
 JOIN student_rosters r ON r.id=v.roster_id
 WHERE a.officer_user_id=$1 AND a.appointed_by<>$1 AND length(trim(a.appointment_reference))>=5
 AND a.revoked_at IS NULL AND a.starts_at<=clock_timestamp() AND a.expires_at>clock_timestamp()
 AND a.institution_id=v.institution_id AND a.institution_id=r.institution_id
 AND a.department_code=r.department_code AND a.cohort=r.batch_year
 AND c.status='CLEARED' AND c.revoked_at IS NULL AND c.starts_at<=clock_timestamp() AND c.expires_at>clock_timestamp()
 AND c.recorded_by<>$1 AND c.recorded_by<>v.user_id AND v.user_id<>$1
 AND (SELECT count(*) FROM verification_officer_appointments b WHERE b.officer_user_id=$1 AND b.institution_id=a.institution_id AND b.department_code=a.department_code AND b.cohort=a.cohort AND b.revoked_at IS NULL AND b.starts_at<=clock_timestamp() AND b.expires_at>clock_timestamp())=1`,[actorId])).rows.map(r=>r.request_id);
}
