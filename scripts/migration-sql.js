// Migration files contain their own transaction wrappers and leading comments.
// The runner owns the single transaction, including checksum bookkeeping.
export function migrationBody(sql) {
 const statements=sql.replace(/^\s*BEGIN;\s*$/gmi,'').replace(/^\s*COMMIT;\s*$/gmi,'');
 if(/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/mi.test(statements)) throw new Error('Unexpected transaction wrapper.');
 return statements;
}
