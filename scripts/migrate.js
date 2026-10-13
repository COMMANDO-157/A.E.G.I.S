import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {databaseOptions} from '../server/config.js';
import {migrationBody} from './migration-sql.js';
const isProduction = process.env.NODE_ENV === 'production' || process.env.TARGET_ENV === 'production';
const through=process.argv.find(arg=>arg.startsWith('--through='))?.slice('--through='.length);
const rawConn = process.env.MIGRATION_DATABASE_URL || (!isProduction ? process.env.DATABASE_URL : null);

if (!rawConn) {
  if (isProduction) {
    console.error('Target safety violation: Production migration requires MIGRATION_DATABASE_URL to be explicitly configured.');
  } else {
    console.error('Database connection not configured. Specify MIGRATION_DATABASE_URL or DATABASE_URL.');
  }
  process.exit(1);
}

// Target parameter validation
let parsedUrl;
try {
  parsedUrl = new URL(rawConn);
} catch {
  console.error('Malformed connection string provided.');
  process.exit(1);
}

// In production, enforce explicit hostname and database confirmation
if (isProduction) {
  const expectedHost = process.env.EXPECTED_PRODUCTION_HOST;
  const expectedDb = process.env.EXPECTED_PRODUCTION_DB || 'aegis';
  const expectedUser = process.env.EXPECTED_PRODUCTION_USER || 'neondb_owner';

  if (!expectedHost) {
    console.error('Target safety violation: Production migration requires EXPECTED_PRODUCTION_HOST to be explicitly confirmed.');
    process.exit(1);
  }

  if (parsedUrl.hostname.toLowerCase() !== expectedHost.toLowerCase()) {
    console.error(`Target mismatch: Target hostname does not match independently confirmed EXPECTED_PRODUCTION_HOST (${expectedHost}).`);
    process.exit(1);
  }

  if (parsedUrl.hostname.toLowerCase().includes('-pooler')) {
    console.error('Target safety violation: Migration requires direct database host, -pooler endpoint forbidden.');
    process.exit(1);
  }

  const dbName = parsedUrl.pathname.replace(/^\//, '');
  if (dbName !== expectedDb) {
    console.error(`Target mismatch: Target database (${dbName}) does not match expected (${expectedDb}).`);
    process.exit(1);
  }

  if (parsedUrl.username !== expectedUser) {
    console.error(`Target mismatch: Target user (${parsedUrl.username}) does not match expected (${expectedUser}).`);
    process.exit(1);
  }
}

const pool = new pg.Pool({
  ...databaseOptions({ ...process.env, DATABASE_URL: rawConn }),
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
  max: 1
});
let client;
try {
 client=await pool.connect();
 await client.query('BEGIN');
 await client.query("SET LOCAL lock_timeout = '5s'");
 await client.query("SELECT pg_advisory_xact_lock(hashtext('aegis:migrations'))");
 await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 const directory=new URL('../migrations/',import.meta.url);
 const names=(await readdir(directory)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
 if(through!==undefined&&!names.includes(through)) throw new Error('Unknown migration boundary.');
 for(const name of names.filter(name=>through===undefined||name<=through)) {
  const sql=await readFile(new URL(name,directory),'utf8'),checksum=createHash('sha256').update(sql.replaceAll('\r\n','\n')).digest('hex');
  const existing=await client.query('SELECT checksum FROM schema_migrations WHERE name=$1',[name]);
  if(existing.rowCount){if(existing.rows[0].checksum!==checksum)throw new Error('Applied migration changed: '+name);continue;}
  await client.query(migrationBody(sql));
  await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);
  console.log('Applied migration:',name);
 }
 await client.query('COMMIT');
 console.log('Migrations verified.');
} catch(error){if(client)await client.query('ROLLBACK');console.error('Migration failed:',error.code||error.message);process.exitCode=1;}
finally{client?.release();await pool.end();}
