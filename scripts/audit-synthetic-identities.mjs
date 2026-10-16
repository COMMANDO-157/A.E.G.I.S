// Deliberately no file/database input option: real student records are not authorized.
import {auditIdentityBindings,syntheticIdentityAuditFixture} from '../server/identity-audit.js';
if(process.argv.slice(2).join(' ')!=='--synthetic')throw Error('Only --synthetic is supported. No real account input is accepted.');
console.log(JSON.stringify(auditIdentityBindings(syntheticIdentityAuditFixture()),null,2));
