import {database,transaction} from '../server/db.js';

// Parse command line arguments:
// npm run admin:bootstrap -- <subject>
// or
// npm run admin:bootstrap -- --owner <subject>
const args = process.argv.slice(2);
const isOwnerFlag = args.includes('--owner');
const subject = args.find(a => a !== '--owner');

if (!subject || !/^[0-9]+$/.test(subject)) {
  console.error('Usage: npm run admin:bootstrap -- [--owner] <google_subject_id>');
  console.error('Example: npm run admin:bootstrap -- --owner 109823471029384710293');
  throw new Error('Supply the verified Google subject ID of an existing account.');
}

try {
  await transaction(async db => {
    // Check if user exists
    const check = await db.query('SELECT id, email, role, is_primary_owner FROM users WHERE google_subject_id=$1', [subject]);
    if (check.rowCount !== 1) {
      throw new Error(`No existing Google account found with subject ID ${subject}. User must authenticate via Google first.`);
    }

    if (isOwnerFlag) {
      // Check if another Primary Owner already exists
      const existingOwner = await db.query('SELECT id, email FROM users WHERE is_primary_owner = true AND google_subject_id <> $1', [subject]);
      if (existingOwner.rowCount > 0) {
        throw new Error(`A Primary Owner already exists (${existingOwner.rows[0].email}). Model A permits exactly one Primary Owner.`);
      }

      await db.query(
        "UPDATE users SET role='admin', is_primary_owner=true, account_status='active' WHERE google_subject_id=$1",
        [subject]
      );
      await db.query("DELETE FROM sessions WHERE user_id=$1", [check.rows[0].id]);
      await db.query("INSERT INTO audit_logs(actor_id,action,details) VALUES($1,'TRUSTED_PRIMARY_OWNER_BOOTSTRAP',$2)", [
        check.rows[0].id,
        JSON.stringify({ subject, email: check.rows[0].email })
      ]);
      console.log(`[A.E.G.I.S Security] Primary Owner successfully designated for: ${check.rows[0].email}`);
    } else {
      await db.query(
        "UPDATE users SET role='admin', account_status='active' WHERE google_subject_id=$1",
        [subject]
      );
      await db.query("DELETE FROM sessions WHERE user_id=$1", [check.rows[0].id]);
      await db.query("INSERT INTO audit_logs(actor_id,action,details) VALUES($1,'TRUSTED_DELEGATED_ADMIN_BOOTSTRAP',$2)", [
        check.rows[0].id,
        JSON.stringify({ subject, email: check.rows[0].email })
      ]);
      console.log(`[A.E.G.I.S Security] Administrator assigned by trusted server-side operator for: ${check.rows[0].email}`);
    }
  });
} finally {
  await database().end();
}
