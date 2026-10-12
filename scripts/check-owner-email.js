import {checkOwnerEmailProvider} from '../server/owner-email.js';
try {console.log(JSON.stringify(await checkOwnerEmailProvider()));}
catch {console.error('Owner email preflight blocked. Configure a verified sender domain and an API key permitted to read that domain. No email sent.');process.exitCode=1;}
