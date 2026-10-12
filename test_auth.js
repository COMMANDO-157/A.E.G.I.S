import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import handler from './server/handler.js';
import {canRead,canAct,requireAdmin,reviewDecision,fieldsOnly,safeComplaint} from './server/policy.js';
const student={id:'student-a',role:'student',account_status:'active',department:'CS'};
const hod={id:'staff-a',role:'HOD',account_status:'active',department:'CS'};
const complaint={id:'c1',owner_user_id:'student-a',department:'CS',assigned_authority:'HOD',verification_status:'Submitted'};
test('Student can read their own report',()=>assert.equal(canRead(student,complaint),true));
test('Student A cannot read Student B report',()=>assert.equal(canRead(student,{...complaint,owner_user_id:'student-b'}),false));
test('Student cannot perform authority actions',()=>assert.equal(canAct(student,complaint),false));
test('HOD is scoped to assigned tier',()=>assert.equal(canRead(hod,{...complaint,assigned_authority:'Dean'}),false));
test('HOD is scoped to approved department',()=>assert.equal(canRead(hod,{...complaint,department:'ME'}),false));
test('Unknown roles fail closed',()=>assert.equal(canRead({...student,role:'superuser'},complaint),false));
test('Suspended staff cannot read cases',()=>assert.equal(canRead({...hod,account_status:'suspended'},complaint),false));
test('Higher Authority can review lower tiers',()=>assert.equal(canAct({...hod,role:'Higher Authority'},complaint),true));
test('Student cannot enter admin endpoints',()=>assert.throws(()=>requireAdmin(student),{status:403}));
test('Approved admin can enter admin endpoints',()=>assert.doesNotThrow(()=>requireAdmin({...student,role:'admin'})));
test('Profile mutation rejects client-supplied role',()=>assert.throws(()=>fieldsOnly({department:'CS',role:'admin'},['department','staff_requested']),{status:422}));
test('Complaint mutation rejects forged ownership',()=>assert.throws(()=>fieldsOnly({owner_user_id:'student-b'},['category','description']),{status:422}));
test('Human verification rejects skipped resolution',()=>assert.throws(()=>reviewDecision(hod,complaint,{verification_status:'Resolved',notes:'Fictional detailed reasons.'}),{status:422}));
test('Human verification requires supporting reasons',()=>assert.throws(()=>reviewDecision(hod,complaint,{verification_status:'Identity Verified',notes:'short'}),{status:422}));
test('Human identity verification accepts valid step',()=>assert.doesNotThrow(()=>reviewDecision(hod,complaint,{verification_status:'Identity Verified',notes:'Google identity checked by an authorized reviewer.'})));
test('Student cannot record human findings',()=>assert.throws(()=>reviewDecision(student,complaint,{verification_status:'Identity Verified',notes:'Fictional detailed reasons.'}),{status:403}));
test('Findings Recorded requires explicit human outcome',()=>assert.throws(()=>reviewDecision(hod,{...complaint,verification_status:'Under Review'},{verification_status:'Findings Recorded',notes:'Detailed committee review findings.'}),{status:422}));
test('Inconclusive human findings are supported',()=>assert.doesNotThrow(()=>reviewDecision(hod,{...complaint,verification_status:'Under Review'},{verification_status:'Findings Recorded',notes:'Committee cannot substantiate based on available material.',allegation_status:'Inconclusive'})));
test('Student serialization excludes internal notes and identities',()=>{const safe=safeComplaint({...complaint,notes:'private',reporter_email:'private@example.test'});assert.equal(safe.notes,undefined);assert.equal(safe.reporter_email,undefined);assert.equal(safe.owner_user_id,undefined);});
test('Direct API denies unauthenticated/private and privilege requests',async()=>{
 const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const saved={APP_ORIGIN:process.env.APP_ORIGIN,DATABASE_URL:process.env.DATABASE_URL,GOOGLE_CLIENT_ID:process.env.GOOGLE_CLIENT_ID};
 process.env.APP_ORIGIN=origin;delete process.env.DATABASE_URL;delete process.env.GOOGLE_CLIENT_ID;
 try {
  for(const path of ['complaints','complaints/00000000-0000-0000-0000-000000000000','admin/users','admin/audit','me']) assert.equal((await fetch(origin+'/api/'+path)).status,503);
  const cross=await fetch(origin+'/api/admin/roles',{method:'PATCH',headers:{Origin:'https://attacker.invalid','Content-Type':'application/json'},body:JSON.stringify({role:'admin'})});assert.equal(cross.status,403);
  const configuration=await (await fetch(origin+'/api/config')).json();assert.equal(configuration.ready,false);assert.equal(configuration.DATABASE_URL,undefined);
  const login=await fetch(origin+'/api/auth/google',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({credential:'fake'})});assert.equal(login.status,503);
 }finally{await new Promise(resolve=>server.close(resolve));for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

import {sessionUser,logout,digest,cookie} from './server/auth.js';
import {appOrigin,databaseOptions,intakeEnabled} from './server/config.js';
import {createHandler} from './server/handler.js';
test('APP_ORIGIN rejects paths, credentials, remote HTTP and production HTTP',()=>{
 for(const origin of ['https://example.test/path','https://user:pass@example.test','http://example.test','https://example.test?x=1','https://example.test#fragment'])
 assert.throws(()=>appOrigin({APP_ORIGIN:origin}),{status:503});
 assert.throws(()=>appOrigin({APP_ORIGIN:'http://localhost:5501',NODE_ENV:'production'}),{status:503});
 assert.equal(appOrigin({APP_ORIGIN:'http://localhost:5501'}),'http://localhost:5501');
});
test('PostgreSQL TLS cannot be disabled in production or overridden by URL',()=>{
 assert.throws(()=>databaseOptions({DATABASE_URL:'postgres://localhost/aegis',DATABASE_SSL:'false',NODE_ENV:'production'}),{status:503});
 assert.throws(()=>databaseOptions({DATABASE_URL:'postgres://example.test/aegis',DATABASE_SSL:'false'}),{status:503});
 const options=databaseOptions({DATABASE_URL:'postgres://example.test/aegis?sslmode=no-verify&sslcert=bad',NODE_ENV:'production'});
 assert.equal(options.ssl.rejectUnauthorized,true);assert.equal(new URL(options.connectionString).search,'');
});
test('Authenticated intake remains off by default',()=>assert.equal(intakeEnabled({}),false));
test('Verification rejects extra fields, invalid empty values and excessive notes',()=>{
 const valid={verification_status:'Identity Verified',notes:'Authorized fictional review supporting reasons.'};
 for(const input of [{...valid,role:'admin'},{...valid,evidence_status:''},{...valid,allegation_status:null},{...valid,notes:'x'.repeat(10001)}])
 assert.throws(()=>reviewDecision(hod,complaint,input),{status:422});
});
test('Expired sessions rejected, valid sessions revoked by logout, malformed cookies cleared',async()=>{
 const previous=process.env.APP_ORIGIN;process.env.APP_ORIGIN='https://example.test';
 const token='a'.repeat(43),req={headers:{cookie:'aegis_session='+token}};
 let stored={...student,session_expires_at:new Date(Date.now()-1000).toISOString()};
 const db={query:async(sql,values)=>{
  assert.equal(values[0],digest(token));
  if(sql.startsWith('DELETE')){stored=null;return {rowCount:1};}
  assert.match(sql,/expires_at>now\(\)/);return {rows:stored?[stored]:[]};
 }};
 const headers={};const res={setHeader:(name,value)=>headers[name]=value};
 try{
  await assert.rejects(sessionUser(req,db),{status:401});
  stored={...student,session_expires_at:new Date(Date.now()+100000).toISOString()};
  assert.equal((await sessionUser(req,db)).id,student.id);
  await logout(req,res,db);assert.ok(headers['Set-Cookie'].every(value=>value.includes('Max-Age=0')&&value.includes('Secure')&&value.includes('HttpOnly')));
  await assert.rejects(sessionUser(req,db),{status:401});
  await logout({headers:{cookie:'aegis_session=invalid'}},res,{query:()=>assert.fail('Malformed token must not query database')});
  assert.ok(headers['Set-Cookie'][0].includes('Max-Age=0'));
 }finally{if(previous===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=previous;}
});
test('HTTP logout bypasses expired session lookup but rejects CSRF first',async()=>{
 let lookedUp=false,deleted=false;
 const server=http.createServer(createHandler({
 sessionUser:async()=>{lookedUp=true;throw Object.assign(Error('Expired'),{status:401});},
 logout:async(req,res)=>{deleted=true;res.setHeader('Set-Cookie','aegis_session=; HttpOnly; SameSite=Strict; Max-Age=0');}
 }));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,previous=process.env.APP_ORIGIN;
 process.env.APP_ORIGIN=origin;
 try{
  for(const untrusted of ['https://attacker.test','null',undefined]){
   const headers={'Content-Type':'application/json'};if(untrusted!==undefined)headers.Origin=untrusted;
   assert.equal((await fetch(origin+'/api/auth/logout',{method:'POST',headers,body:'{}'})).status,403);
   assert.equal(deleted,false);
  }
  const response=await fetch(origin+'/api/auth/logout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'aegis_session=expired'},body:'{}'});
  assert.equal(response.status,200);assert.equal(deleted,true);assert.equal(lookedUp,false);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
 }finally{await new Promise(resolve=>server.close(resolve));if(previous===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=previous;}
});

test('Production intake requires LIVE_INTAKE_ENABLED=true and valid configuration',()=>{
 assert.equal(intakeEnabled({APP_ORIGIN:'https://aegis-command-x.vercel.app',DATABASE_URL:'postgres://example.test/aegis',GOOGLE_CLIENT_ID:'123-test.apps.googleusercontent.com',LIVE_INTAKE_ENABLED:'false',NODE_ENV:'production'}),false);
 assert.equal(intakeEnabled({APP_ORIGIN:'https://aegis-command-x.vercel.app',DATABASE_URL:'postgres://example.test/aegis',GOOGLE_CLIENT_ID:'123-test.apps.googleusercontent.com',LIVE_INTAKE_ENABLED:'true',NODE_ENV:'production'}),true);
});
test('Actual complaint endpoints enforce ownership, department scope and payload validation',async()=>{
 const keys=['APP_ORIGIN','DATABASE_URL','GOOGLE_CLIENT_ID','LIVE_INTAKE_ENABLED','NODE_ENV','VERCEL'];
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 delete process.env.VERCEL;process.env.NODE_ENV='test';process.env.DATABASE_URL='postgres://localhost/fictional';
 process.env.GOOGLE_CLIENT_ID='123-test.apps.googleusercontent.com';process.env.LIVE_INTAKE_ENABLED='true';
 let currentUser=student,currentComplaint={...complaint,id:'00000000-0000-0000-0000-000000000001',owner_user_id:'student-b'};
 const db={query:async()=>({rows:[currentComplaint],rowCount:1})};
 const server=http.createServer(createHandler({sessionUser:async()=>currentUser,logout},{database:()=>db,transaction:fn=>fn(db)},{consumeRateLimit:async()=>({remaining:100})}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;process.env.APP_ORIGIN=origin;
 const path=origin+'/api/complaints/'+currentComplaint.id;
 const patch=(value,headers={})=>fetch(path+'/verification',{method:'PATCH',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(value)});
 try{
  assert.equal((await fetch(path)).status,404);
  currentUser={...hod,department:'ME'};assert.equal((await fetch(path)).status,404);
  assert.equal((await patch({verification_status:'Identity Verified',notes:'Fictional authorization review.'})).status,404);
  currentUser=hod;
  assert.equal((await patch({verification_status:'Resolved',notes:'Fictional authorization review.'})).status,422);
  assert.equal((await patch({verification_status:'Identity Verified',notes:'Fictional authorization review.',role:'admin'})).status,422);
  assert.equal((await patch({verification_status:'Identity Verified',notes:'Fictional authorization review.'},{Origin:'https://attacker.test'})).status,403);
  currentUser=student;assert.equal((await fetch(origin+'/api/admin/users')).status,403);
 }finally{await new Promise(resolve=>server.close(resolve));for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

// ─── Stage 4.2: Model A, MFA, Action PIN & Step-Up Tests ─────────────────────

import {
  encryptSecret,
  decryptSecret,
  hashActionPin,
  verifyActionPin,
  generateTotpSecret,
  computeTotp,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCode,
  validatePinFormat
} from './server/crypto.js';
import {
  hasAdminPermission,
  requireAdminPermission,
  requirePrimaryOwner,
  DELEGATED_PERMISSIONS
} from './server/policy.js';

test('Cryptographic Invariant: TOTP secrets authenticated encryption roundtrip', () => {
  const secret = generateTotpSecret();
  const encrypted = encryptSecret(secret);
  assert.notEqual(secret, encrypted);
  assert.equal(encrypted.split(':').length, 3);
  const decrypted = decryptSecret(encrypted);
  assert.equal(decrypted, secret);
});

test('Cryptographic Invariant: Tampered ciphertext or wrong tag fails decryption', () => {
  const secret = generateTotpSecret();
  const encrypted = encryptSecret(secret);
  const [iv, tag, cipher] = encrypted.split(':');
  const tamperedCipher = cipher.slice(0, -2) + (cipher.slice(-2) === 'aa' ? 'bb' : 'aa');
  assert.throws(() => decryptSecret(`${iv}:${tag}:${tamperedCipher}`), { status: 500 });
});

test('Cryptographic Invariant: 5-digit Action PIN format, hashing and verification', () => {
  assert.throws(() => validatePinFormat('1234'), { status: 422 });
  assert.throws(() => validatePinFormat('123456'), { status: 422 });
  assert.throws(() => validatePinFormat('1234a'), { status: 422 });
  assert.throws(() => validatePinFormat(''), { status: 422 });
  assert.doesNotThrow(() => validatePinFormat('94821'));

  const { pinHash, pinSalt } = hashActionPin('94821');
  assert.equal(verifyActionPin('94821', pinHash, pinSalt), true);
  assert.equal(verifyActionPin('94820', pinHash, pinSalt), false);
  assert.equal(verifyActionPin('00000', pinHash, pinSalt), false);
});

test('Cryptographic Invariant: RFC 6238 TOTP computation and drift tolerance', () => {
  const secret = generateTotpSecret();
  const currentCode = computeTotp(secret, 0);
  assert.equal(verifyTotp(currentCode, secret), true);
  // Drift: previous step (-1) and next step (+1) should verify
  const prevCode = computeTotp(secret, -1);
  const nextCode = computeTotp(secret, 1);
  assert.equal(verifyTotp(prevCode, secret), true);
  assert.equal(verifyTotp(nextCode, secret), true);
  // Outside window (+2) must fail
  const distantCode = computeTotp(secret, 2);
  assert.equal(verifyTotp('000000', secret), false);
  assert.equal(verifyTotp('bad', secret), false);
});

test('Cryptographic Invariant: Recovery codes generated and verified via SHA-256', () => {
  const { plaintextCodes, hashedCodes } = generateRecoveryCodes(8);
  assert.equal(plaintextCodes.length, 8);
  assert.equal(hashedCodes.length, 8);
  assert.equal(hashRecoveryCode(plaintextCodes[0]), hashedCodes[0]);
  assert.notEqual(hashRecoveryCode('WRONG-CODE'), hashedCodes[0]);
});

test('Model A Permissions: Primary Owner has universal admin permissions', () => {
  const primaryOwner = { id: 'owner-1', role: 'admin', is_primary_owner: true, account_status: 'active' };
  for (const perm of DELEGATED_PERMISSIONS) {
    assert.equal(hasAdminPermission(primaryOwner, perm), true);
    assert.doesNotThrow(() => requireAdminPermission(primaryOwner, perm));
  }
  assert.doesNotThrow(() => requirePrimaryOwner(primaryOwner));
});

test('Model A Permissions: Delegated administrator has only assigned permissions', () => {
  const delegatedAdmin = {
    id: 'admin-2',
    role: 'admin',
    is_primary_owner: false,
    account_status: 'active',
    permissions: ['users.read', 'audit.read']
  };
  assert.equal(hasAdminPermission(delegatedAdmin, 'users.read'), true);
  assert.equal(hasAdminPermission(delegatedAdmin, 'audit.read'), true);
  assert.equal(hasAdminPermission(delegatedAdmin, 'users.roles.assign'), false);
  assert.equal(hasAdminPermission(delegatedAdmin, 'users.suspend'), false);

  assert.doesNotThrow(() => requireAdminPermission(delegatedAdmin, 'users.read'));
  assert.throws(() => requireAdminPermission(delegatedAdmin, 'users.roles.assign'), { status: 403 });
  assert.throws(() => requirePrimaryOwner(delegatedAdmin), { status: 403 });
});

test('Model A Permissions: Non-admin users have zero permissions', () => {
  const regularStudent = { id: 'student-1', role: 'student', account_status: 'active', permissions: ['users.read'] };
  assert.equal(hasAdminPermission(regularStudent, 'users.read'), false);
  assert.throws(() => requireAdminPermission(regularStudent, 'users.read'), { status: 403 });
});

test('Negative Security: Delegated admin cannot invoke Primary Owner endpoints', async () => {
  const keys = ['APP_ORIGIN', 'DATABASE_URL', 'GOOGLE_CLIENT_ID', 'NODE_ENV'];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgres://localhost/fictional';

  const delegatedAdminUser = {
    id: 'admin-del-1',
    email: 'admin.del@campus.test',
    role: 'admin',
    is_primary_owner: false,
    account_status: 'active',
    permissions: ['users.read']
  };

  const db = {
    query: async (sql, values) => {
      if (sql.includes('FROM users WHERE id=')) return { rows: [delegatedAdminUser], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }
  };

  const server = http.createServer(
    createHandler(
      { sessionUser: async () => delegatedAdminUser, logout: async () => {} },
      { database: () => db, transaction: fn => fn(db) },
      { consumeRateLimit: async () => ({ remaining: 100 }) }
    )
  );
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  process.env.APP_ORIGIN = origin;

  try {
    // 1. Delegated admin attempting to grant permissions (Primary Owner only)
    const permRes = await fetch(origin + '/api/admin/permissions', {
      method: 'PATCH',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: '00000000-0000-0000-0000-000000000002', permissions: ['users.read'] })
    });
    assert.equal(permRes.status, 403);

    // 2. Delegated admin attempting to send administrator invitation (Primary Owner only)
    const inviteRes = await fetch(origin + '/api/admin/invitations', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'newadmin@campus.test', permissions: ['users.read'] })
    });
    assert.equal(inviteRes.status, 403);

    // 3. Delegated admin lacking 'users.roles.assign' attempting to assign a role
    const roleRes = await fetch(origin + '/api/admin/roles', {
      method: 'PATCH',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: '00000000-0000-0000-0000-000000000002',
        role: 'HOD',
        department: 'CS',
        account_status: 'active'
      })
    });
    assert.equal(roleRes.status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('Negative Security: 5 failed Action PIN attempts trigger lockout and reject requests', async () => {
  const keys = ['APP_ORIGIN', 'DATABASE_URL', 'GOOGLE_CLIENT_ID', 'NODE_ENV'];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgres://localhost/fictional';

  const { pinHash, pinSalt } = hashActionPin('54321');
  let userRow = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin.pin@campus.test',
    role: 'admin',
    is_primary_owner: false,
    account_status: 'active',
    action_pin_hash: pinHash,
    action_pin_salt: pinSalt,
    action_pin_failed_attempts: 0,
    action_pin_locked_until: null
  };

  const db = {
    query: async (sql, values) => {
      if (sql.includes('SELECT * FROM users WHERE id=')) {
        return { rows: [userRow], rowCount: 1 };
      }
      if (sql.includes('UPDATE users SET action_pin_failed_attempts=')) {
        userRow.action_pin_failed_attempts = values[0];
        userRow.action_pin_locked_until = values[1];
        return { rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };

  const server = http.createServer(
    createHandler(
      { sessionUser: async () => userRow, logout: async () => {} },
      { database: () => db, transaction: fn => fn(db) },
      { consumeRateLimit: async () => ({ remaining: 100 }) }
    )
  );
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  process.env.APP_ORIGIN = origin;

  try {
    // 4 failed attempts should return 401
    for (let i = 1; i <= 4; i++) {
      const res = await fetch(origin + '/api/admin/pin/verify', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '00000' })
      });
      assert.equal(res.status, 401);
    }
    // 5th failed attempt should trigger 429 lockout
    const fifthRes = await fetch(origin + '/api/admin/pin/verify', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '00000' })
    });
    assert.equal(fifthRes.status, 429);
    assert.ok(userRow.action_pin_locked_until !== null);

    // Subsequent attempt even with CORRECT pin must be rejected while locked
    const lockedRes = await fetch(origin + '/api/admin/pin/verify', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '54321' })
    });
    assert.equal(lockedRes.status, 429);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

import { issueStepUpToken, verifyStepUpToken } from './server/auth.js';
test('Security Invariant: Step-up tokens bound to session_hash, purpose, user, and single-use expiry', async () => {
  const tokens = [];
  const fakeDb = {
    query: async (sql, values) => {
      if (sql.includes('INSERT INTO step_up_tokens')) {
        tokens.push({
          token_hash: values[0],
          user_id: values[1],
          purpose: values[2],
          session_hash: values[3],
          expires_at: new Date(Date.now() + 10 * 60 * 1000)
        });
        return { rowCount: 1 };
      }
      if (sql.includes('DELETE FROM step_up_tokens')) {
        const hash = values[0];
        const uid = values[1];
        const purp = values[2];
        const sess = values[3];
        const idx = tokens.findIndex(t => {
          if (t.token_hash !== hash || t.user_id !== uid || t.purpose !== purp) return false;
          if (t.expires_at <= new Date()) return false;
          if (sess) {
            return t.session_hash === sess || t.session_hash === null;
          }
          return true;
        });
        if (idx !== -1) {
          const removed = tokens.splice(idx, 1);
          return { rowCount: 1, rows: removed };
        }
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    }
  };

  const userId = '00000000-0000-0000-0000-000000000001';
  const sessionA = 'session_hash_user1_a';
  const sessionB = 'session_hash_user1_b';

  // 1. Issue token bound to session A
  const token = await issueStepUpToken(userId, 'admin_step_up', fakeDb, sessionA);
  assert.equal(typeof token, 'string');
  assert.ok(token.length >= 32);

  // 2. Negative test: Verification with wrong session must fail
  const wrongSession = await verifyStepUpToken(userId, 'admin_step_up', token, fakeDb, sessionB);
  assert.equal(wrongSession, false, 'Token used in different session must be rejected');

  // 3. Negative test: Verification with wrong purpose must fail
  const wrongPurpose = await verifyStepUpToken(userId, 'other_purpose', token, fakeDb, sessionA);
  assert.equal(wrongPurpose, false, 'Token used with wrong purpose must be rejected');

  // 4. Negative test: Verification with wrong user must fail
  const wrongUser = await verifyStepUpToken('00000000-0000-0000-0000-000000000002', 'admin_step_up', token, fakeDb, sessionA);
  assert.equal(wrongUser, false, 'Token used with wrong user must be rejected');

  // 5. Successful verification in correct session consumes the token atomically
  const correctUse = await verifyStepUpToken(userId, 'admin_step_up', token, fakeDb, sessionA);
  assert.equal(correctUse, true, 'Token must verify with matching user, purpose, and session');

  // 6. Negative test: Replay / reuse attempt of consumed token must fail
  const replayed = await verifyStepUpToken(userId, 'admin_step_up', token, fakeDb, sessionA);
  assert.equal(replayed, false, 'Consumed token must not be reusable');

  // 7. Negative test: Expired token must be rejected
  const expToken = await issueStepUpToken(userId, 'admin_step_up', fakeDb, sessionA);
  const found = tokens.find(t => t.user_id === userId);
  if (found) found.expires_at = new Date(Date.now() - 1000); // simulate expiry
  const expiredAttempt = await verifyStepUpToken(userId, 'admin_step_up', expToken, fakeDb, sessionA);
  assert.equal(expiredAttempt, false, 'Expired step-up token must be rejected');
});

test('Negative Security: Privileged endpoints require valid step-up token and reject missing/reused/wrong tokens with 403', async () => {
  const keys = ['APP_ORIGIN', 'DATABASE_URL', 'GOOGLE_CLIENT_ID', 'NODE_ENV', 'PRIMARY_OWNER_USER_ID', 'PRIMARY_OWNER_EMAIL'];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgres://localhost/fictional';

  const adminSessionHash = 'admin_session_hash_123';
  const ownerUser = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'owner@campus.test',
    role: 'admin',
    is_primary_owner: true,
    account_status: 'active',
    session_hash: adminSessionHash,
    mfa_enrolled: true,
    mfa_secret_encrypted: 'mock_encrypted_secret',
    action_pin_hash: 'mock_pin_hash',
    action_pin_salt: 'mock_pin_salt'
  };

  const stepUpTokens = [];
  process.env.PRIMARY_OWNER_USER_ID=ownerUser.id;
  process.env.PRIMARY_OWNER_EMAIL=ownerUser.email;
  const ownerGrant='g'.repeat(43);
  const db = {
    query: async (sql, values) => {
      if(sql.includes('SELECT g.token_hash FROM owner_portal_grants')) {
        assert.equal(values[0],digest(ownerGrant));
        assert.equal(values[1],ownerUser.id);
        assert.equal(values[2],ownerUser.session_hash);
        return {rows:[{token_hash:values[0]}],rowCount:1};
      }
      if (sql.includes('SELECT * FROM users WHERE id=')) {
        if (values[0] === ownerUser.id) return { rows: [ownerUser], rowCount: 1 };
        return {
          rows: [{
            id: values[0],
            email: 'target@campus.test',
            role: 'student',
            is_primary_owner: false,
            account_status: 'active'
          }],
          rowCount: 1
        };
      }
      if (sql.includes('INSERT INTO step_up_tokens')) {
        stepUpTokens.push({
          token_hash: values[0],
          user_id: values[1],
          purpose: values[2],
          session_hash: values[3],
          expires_at: new Date(Date.now() + 600000)
        });
        return { rowCount: 1 };
      }
      if (sql.includes('DELETE FROM step_up_tokens')) {
        const hash = values[0];
        const uid = values[1];
        const purp = values[2];
        const sess = values[3];
        const idx = stepUpTokens.findIndex(t => {
          if (t.token_hash !== hash || t.user_id !== uid || t.purpose !== purp) return false;
          if (t.expires_at <= new Date()) return false;
          if (sess) return t.session_hash === sess || t.session_hash === null;
          return true;
        });
        if (idx !== -1) {
          const removed = stepUpTokens.splice(idx, 1);
          return { rowCount: 1, rows: removed };
        }
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes('UPDATE users SET role=')) {
        return { rowCount: 1, rows: [{ id: values[3] }] };
      }
      if (sql.includes('INSERT INTO admin_invitations')) {
        return { rowCount: 1 };
      }
      if (sql.includes('INSERT INTO admin_permissions')) {
        return { rowCount: 1 };
      }
      if (sql.includes('DELETE FROM sessions')) {
        return { rowCount: 1 };
      }
      if (sql.includes('DELETE FROM admin_permissions')) {
        return { rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };

  const server = http.createServer(
    createHandler(
      { sessionUser: async () => ownerUser, logout: async () => {} },
      { database: () => db, transaction: fn => fn(db) },
      { consumeRateLimit: async () => ({ remaining: 100 }) }
    )
  );
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  process.env.APP_ORIGIN = origin;

  try {
    const targetId = '00000000-0000-0000-0000-000000000002';

    // 1. Roles endpoint: Missing stepUpToken must return 403
    const roleMissing = await fetch(origin + '/api/admin/roles', {
      method: 'PATCH',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Aegis-Owner-Grant': ownerGrant },
      body: JSON.stringify({
        userId: targetId,
        role: 'HOD',
        department: 'CS',
        account_status: 'active'
      })
    });
    assert.equal(roleMissing.status, 403, 'Roles PATCH missing stepUpToken must return 403');

    // 2. Roles endpoint: Invalid / wrong stepUpToken must return 403
    const roleInvalid = await fetch(origin + '/api/admin/roles', {
      method: 'PATCH',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Aegis-Owner-Grant': ownerGrant },
      body: JSON.stringify({
        userId: targetId,
        role: 'HOD',
        department: 'CS',
        account_status: 'active',
        stepUpToken: 'invalid_token_xyz'
      })
    });
    assert.equal(roleInvalid.status, 403, 'Roles PATCH invalid stepUpToken must return 403');

    // 3. Permissions endpoint: Missing stepUpToken must return 403
    const permMissing = await fetch(origin + '/api/admin/permissions', {
      method: 'PATCH',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Aegis-Owner-Grant': ownerGrant },
      body: JSON.stringify({
        userId: targetId,
        permissions: ['users.read']
      })
    });
    assert.equal(permMissing.status, 403, 'Permissions PATCH missing stepUpToken must return 403');

    // 4. Invitations endpoint: Missing stepUpToken must return 403
    const inviteMissing = await fetch(origin + '/api/admin/invitations', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Aegis-Owner-Grant': ownerGrant },
      body: JSON.stringify({
        email: 'invited@campus.test',
        permissions: ['users.read']
      })
    });
    assert.equal(inviteMissing.status, 403, 'Invitations POST missing stepUpToken must return 403');

    // 5. Valid step-up token succeeds, but reuse immediately fails with 403
    const validToken = await issueStepUpToken(ownerUser.id, 'admin_step_up', db, adminSessionHash);
    const roleSuccess = await fetch(origin + '/api/admin/roles', {
      method: 'PATCH',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Aegis-Owner-Grant': ownerGrant },
      body: JSON.stringify({
        userId: targetId,
        role: 'HOD',
        department: 'CS',
        account_status: 'active',
        stepUpToken: validToken
      })
    });
    assert.equal(roleSuccess.status, 200, 'Roles PATCH with valid stepUpToken must succeed');

    // Replay attempt with same token must fail with 403
    const roleReplay = await fetch(origin + '/api/admin/roles', {
      method: 'PATCH',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Aegis-Owner-Grant': ownerGrant },
      body: JSON.stringify({
        userId: targetId,
        role: 'HOD',
        department: 'CS',
        account_status: 'active',
        stepUpToken: validToken
      })
    });
    assert.equal(roleReplay.status, 403, 'Roles PATCH replaying stepUpToken must return 403');

    // 6. Token issued for wrong session must return 403
    const wrongSessionToken = await issueStepUpToken(ownerUser.id, 'admin_step_up', db, 'different_session_hash');
    const roleWrongSession = await fetch(origin + '/api/admin/roles', {
      method: 'PATCH',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Aegis-Owner-Grant': ownerGrant },
      body: JSON.stringify({
        userId: targetId,
        role: 'HOD',
        department: 'CS',
        account_status: 'active',
        stepUpToken: wrongSessionToken
      })
    });
    assert.equal(roleWrongSession.status, 403, 'Roles PATCH with wrong-session stepUpToken must return 403');

    // 7. Token issued for wrong purpose must return 403
    const wrongPurposeToken = await issueStepUpToken(ownerUser.id, 'mfa_step_up', db, adminSessionHash);
    const roleWrongPurpose = await fetch(origin + '/api/admin/roles', {
      method: 'PATCH',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Aegis-Owner-Grant': ownerGrant },
      body: JSON.stringify({
        userId: targetId,
        role: 'HOD',
        department: 'CS',
        account_status: 'active',
        stepUpToken: wrongPurposeToken
      })
    });
    assert.equal(roleWrongPurpose.status, 403, 'Roles PATCH with wrong-purpose stepUpToken must return 403');
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('Negative Security: /api/admin/step-up enforces dual MFA and PIN prerequisites', async () => {
  const keys = ['APP_ORIGIN', 'DATABASE_URL', 'GOOGLE_CLIENT_ID', 'NODE_ENV'];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgres://localhost/fictional';

  // Admin without MFA enrolled
  let currentAdmin = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin.nopreq@campus.test',
    role: 'admin',
    is_primary_owner: false,
    account_status: 'active',
    mfa_enrolled: false,
    mfa_secret_encrypted: null,
    action_pin_hash: 'hash',
    action_pin_salt: 'salt'
  };

  const db = {
    query: async (sql, values) => {
      if (sql.includes('SELECT * FROM users WHERE id=')) {
        return { rows: [currentAdmin], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };

  const server = http.createServer(
    createHandler(
      { sessionUser: async () => currentAdmin, logout: async () => {} },
      { database: () => db, transaction: fn => fn(db) },
      { consumeRateLimit: async () => ({ remaining: 100 }) }
    )
  );
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  process.env.APP_ORIGIN = origin;

  try {
    // Attempt step-up when MFA is missing -> must return 403
    const noMfaRes = await fetch(origin + '/api/admin/step-up', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '123456', pin: '12345' })
    });
    assert.equal(noMfaRes.status, 403, 'Missing MFA prerequisite must reject step-up with 403');

    // Admin has MFA but no Action PIN set
    currentAdmin.mfa_enrolled = true;
    currentAdmin.mfa_secret_encrypted = 'secret';
    currentAdmin.action_pin_hash = null;
    currentAdmin.action_pin_salt = null;

    const noPinRes = await fetch(origin + '/api/admin/step-up', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '123456', pin: '12345' })
    });
    assert.equal(noPinRes.status, 403, 'Missing Action PIN prerequisite must reject step-up with 403');
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('Security Invariant: /api/admin/step-up enforces concurrent dual-factor verification (MFA + PIN)', async () => {
  const keys = ['APP_ORIGIN', 'DATABASE_URL', 'GOOGLE_CLIENT_ID', 'NODE_ENV'];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgres://localhost/fictional';

  const mfaSecret = generateTotpSecret();
  const encryptedSecret = encryptSecret(mfaSecret);
  const correctTotp = computeTotp(mfaSecret, 0);
  const correctPin = '54321';
  const { pinHash, pinSalt } = hashActionPin(correctPin);

  const adminUser = {
    id: '00000000-0000-0000-0000-000000000099',
    email: 'admin.dualfactor@campus.test',
    role: 'admin',
    is_primary_owner: false,
    account_status: 'active',
    mfa_enrolled: true,
    mfa_secret_encrypted: encryptedSecret,
    action_pin_hash: pinHash,
    action_pin_salt: pinSalt,
    action_pin_failed_attempts: 0,
    action_pin_locked_until: null,
    session_hash: 'sess_dual_factor_test'
  };

  const tokens = [];
  const db = {
    query: async (sql, values) => {
      if (sql.includes('SELECT * FROM users WHERE id=')) {
        return { rows: [adminUser], rowCount: 1 };
      }
      if (sql.includes('UPDATE users SET action_pin_failed_attempts=')) {
        adminUser.action_pin_failed_attempts = values[0];
        adminUser.action_pin_locked_until = values[1];
        return { rowCount: 1 };
      }
      if (sql.includes('INSERT INTO step_up_tokens')) {
        tokens.push({
          token_hash: values[0],
          user_id: values[1],
          purpose: values[2],
          session_hash: values[3]
        });
        return { rowCount: 1 };
      }
      if (sql.includes('INSERT INTO audit_logs')) {
        return { rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };

  const server = http.createServer(
    createHandler(
      { sessionUser: async () => adminUser, logout: async () => {} },
      { database: () => db, transaction: fn => fn(db) },
      { consumeRateLimit: async () => ({ remaining: 100 }) }
    )
  );
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  process.env.APP_ORIGIN = origin;

  try {
    // 1. Missing either factor fails with 422
    const missingPin = await fetch(origin + '/api/admin/step-up', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: correctTotp })
    });
    assert.equal(missingPin.status, 422, 'Missing PIN must return 422');

    const missingMfa = await fetch(origin + '/api/admin/step-up', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: correctPin })
    });
    assert.equal(missingMfa.status, 422, 'Missing MFA must return 422');

    // 2. Correct MFA + Incorrect PIN fails with 401
    const badPinRes = await fetch(origin + '/api/admin/step-up', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: correctTotp, pin: '00000' })
    });
    assert.equal(badPinRes.status, 401, 'Bad PIN with good MFA must return 401');
    assert.equal(tokens.length, 0, 'No step-up token issued on bad PIN');

    // 3. Incorrect MFA + Correct PIN fails with 401
    const badMfaRes = await fetch(origin + '/api/admin/step-up', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '000000', pin: correctPin })
    });
    assert.equal(badMfaRes.status, 401, 'Bad MFA with good PIN must return 401');
    assert.equal(tokens.length, 0, 'No step-up token issued on bad MFA');

    // 4. Correct MFA + Correct PIN succeeds with 200 and issues token
    const successRes = await fetch(origin + '/api/admin/step-up', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: correctTotp, pin: correctPin })
    });
    assert.equal(successRes.status, 200, 'Concurrent valid MFA + PIN must return 200');
    const data = await successRes.json();
    assert.equal(data.verified, true);
    assert.ok(typeof data.stepUpToken === 'string' && data.stepUpToken.length >= 32);
    assert.equal(tokens.length, 1, 'Exactly one step-up token issued');

    // 5. PIN lockout prevents step-up even with valid MFA
    adminUser.action_pin_locked_until = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const lockedRes = await fetch(origin + '/api/admin/step-up', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: correctTotp, pin: correctPin })
    });
    assert.equal(lockedRes.status, 429, 'Locked Action PIN must reject step-up with 429');
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('Regression: /api/auth/challenge issues valid cookie and preserves attributes across environments', async () => {
  const previousOrigin = process.env.APP_ORIGIN;
  const previousEnv = process.env.NODE_ENV;
  try {
    // 1. Local development (HTTP origin)
    process.env.APP_ORIGIN = 'http://localhost:5173';
    delete process.env.NODE_ENV;
    const localCookie = cookie('aegis_challenge', 'test_nonce_123', 300);
    assert.ok(localCookie.includes('Path=/'), 'Must have Path=/');
    assert.ok(localCookie.includes('HttpOnly'), 'Must have HttpOnly');
    assert.ok(localCookie.includes('SameSite=Lax'), 'Must have SameSite=Lax for OAuth redirection compatibility');
    assert.ok(!localCookie.includes('Secure'), 'Local HTTP must not require Secure flag');

    // 2. Production (HTTPS or NODE_ENV=production)
    process.env.APP_ORIGIN = 'https://aegis.institutional.edu';
    process.env.NODE_ENV = 'production';
    const prodCookie = cookie('aegis_challenge', 'test_nonce_456', 300);
    assert.ok(prodCookie.includes('Path=/'), 'Must have Path=/ in production');
    assert.ok(prodCookie.includes('HttpOnly'), 'Must have HttpOnly in production');
    assert.ok(prodCookie.includes('SameSite=Lax'), 'Must have SameSite=Lax in production');
    assert.ok(prodCookie.includes('Secure'), 'Production must strictly enforce Secure cookie attribute');
  } finally {
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  }
});
