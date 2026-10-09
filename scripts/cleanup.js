import {database} from '../server/db.js';
import {cleanupExpired} from '../server/maintenance.js';
const db=database();
try {console.log('Expired security records removed:',JSON.stringify(await cleanupExpired(db)));}
catch(error) {console.error('Cleanup failed:',error.code||error.name);process.exitCode=1;}
finally {await db.end();}
