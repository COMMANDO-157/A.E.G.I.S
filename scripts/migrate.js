import {readFile} from 'node:fs/promises';
import {database} from '../server/db.js';
const pool=database();
try { await pool.query(await readFile(new URL('../migrations/001_stage3.sql',import.meta.url),'utf8')); console.log('Stage 3 migration applied.'); } finally { await pool.end(); }
