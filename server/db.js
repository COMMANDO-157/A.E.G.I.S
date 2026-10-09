import pg from 'pg';
import {databaseOptions} from './config.js';
let pool;
export function database() {
 if (!process.env.DATABASE_URL) throw Object.assign(new Error('Database is not configured.'),{status:503});
 if (!pool) pool=new pg.Pool({...databaseOptions(),max:5,
  connectionTimeoutMillis:5000,statement_timeout:10000});
 return pool;
}
export async function transaction(fn) {
 const client=await database().connect();
 try { await client.query('BEGIN'); const result=await fn(client); await client.query('COMMIT'); return result; }
 catch(error) { await client.query('ROLLBACK'); throw error; }
 finally { client.release(); }
}
