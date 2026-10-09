import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {databaseOptions} from '../server/config.js';
const pool=new pg.Pool({...databaseOptions({...process.env,DATABASE_URL:process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL}),connectionTimeoutMillis:10000,statement_timeout:30000,max:1});
let client;
try {
 client=await pool.connect();
 await client.query('BEGIN');
 await client.query("SELECT pg_advisory_xact_lock(hashtext('aegis:migrations'))");
 await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 const directory=new URL('../migrations/',import.meta.url);
 for(const name of (await readdir(directory)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()) {
  const sql=await readFile(new URL(name,directory),'utf8'),checksum=createHash('sha256').update(sql.replaceAll('\r\n','\n')).digest('hex');
  const existing=await client.query('SELECT checksum FROM schema_migrations WHERE name=$1',[name]);
  if(existing.rowCount){if(existing.rows[0].checksum!==checksum)throw new Error('Applied migration changed: '+name);continue;}
  await client.query(sql.replace(/^BEGIN;\s*/i,'').replace(/COMMIT;\s*$/i,''));
  await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);
  console.log('Applied migration:',name);
 }
 await client.query('COMMIT');
 console.log('Migrations verified.');
} catch(error){if(client)await client.query('ROLLBACK');console.error('Migration failed:',error.code||error.message);process.exitCode=1;}
finally{client?.release();await pool.end();}
