import {fail} from './policy.js';

// No catch/fallback on permission or SQL errors: an unavailable catalog is not eligibility.
export async function hasInstitutionSchema(db) {
 return (await db.query("SELECT to_regclass('public.institutions') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.student_rosters'::regclass AND attname='institution_id' AND NOT attisdropped) AS available")).rows[0]?.available===true;
}
export async function resolveInstitution(db,slug='default') {
 if(typeof slug!=='string'||!slug.trim()) fail(422,'An institution slug is required.');
 if(!await hasInstitutionSchema(db)) {
  if(slug!=='default') fail(503,'Institution selection requires schema 007.');
  return null;
 }
 const institution=(await db.query('SELECT * FROM institutions WHERE slug=$1 AND active=true',[slug.trim()])).rows[0];
 if(!institution) fail(422,'Institution is not eligible.');
 return institution;
}
export async function eligibleRoster(db,id,{lock=false}={}) {
 if(!await hasInstitutionSchema(db)) return null;
 const sql=`SELECT sr.* FROM student_rosters sr
 JOIN institutions i ON i.id=sr.institution_id AND i.active=true
 JOIN departments d ON d.code=sr.department_code AND d.active=true AND d.institution_id=sr.institution_id
 WHERE sr.id=$1 AND sr.is_active=true AND sr.is_test_record=false`;
 return (await db.query(sql+(lock?' FOR UPDATE OF sr FOR SHARE OF i,d':''),[id])).rows[0]||null;
}
export async function requireEligibleClaim(db,claim) {
 const roster=await eligibleRoster(db,claim.roster_id,{lock:true});
 if(!roster || roster.institution_id!==claim.institution_id) fail(409,'An active authoritative institution and non-test roster are required.');
 return roster;
}
