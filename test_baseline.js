import assert from 'node:assert/strict';
import { AegisStore } from './js/store.js';
import { generateReferenceId, isValidVerificationPin } from './js/security.js';
import { AUTHORITY_TIERS as T, SEVERITY_LEVELS as S, allowedStatusTransitions, validateManualOverride } from './js/escalation.js';
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); console.log('PASS: ' + name); passed++; } catch (error) { console.error('FAIL: ' + name + ': ' + error.message); failed++; } }
class MemoryStorage {
  constructor(records) { this.raw = records === undefined ? null : JSON.stringify(records); this.failRead = false; this.failWrite = false; this.writes = 0; }
  getItem() { if (this.failRead) throw Error('blocked'); return this.raw; }
  setItem(key, value) { if (this.failWrite) throw Error('quota'); this.raw = value; this.writes++; }
}
const record = (id, tier = T.DEAN, severity = S.LOW, status = 'In Review', group = 'GROUP') => ({
  id, referenceId: 'AEG-2026-' + id, verificationPin: '123456', assignedAuthority: tier,
  severity, status, caseGroupId: group, auditLogs: [{ id: 'original-' + id }], category: 'General Campus Grievance'
});
const reason = 'Fictional administrative review and delegation.';
test('First load seeds four fictional records', () => { const store = new AegisStore(new MemoryStorage()); assert.equal(store.getComplaints().length, 4); });
test('Existing records are not rewritten during startup', () => { const mem = new MemoryStorage([record('A')]); const raw = mem.raw; const store = new AegisStore(mem); assert.equal(mem.raw, raw); assert.equal(mem.writes, 0); assert.equal(store.getComplaints()[0].referenceId, 'AEG-2026-A'); });
test('All original seed credentials remain valid', () => {
  const store = new AegisStore(new MemoryStorage());
  for (const [ref,pin] of [['X7K2','482910'],['P9R4','820145'],['M3W9','319482'],['K4V1','741258']]) assert.ok(store.getComplaintByCredentials('AEG-2026-'+ref,pin));
});
test('Mixed linked-case downgrade is rejected atomically', () => {
 const mem = new MemoryStorage([record('A',T.DEAN),record('B',T.DEAN,S.CRITICAL)]), store = new AegisStore(mem), raw = mem.raw;
 const result = store.overrideComplaintRouting('A',T.HOD,reason,T.DEAN);
 assert.equal(result.success,false); assert.match(result.error,/B:/); assert.equal(mem.raw,raw); assert.equal(mem.writes,0);
});
test('Higher Authority may delegate a critical linked case with rationale', () => {
 const store = new AegisStore(new MemoryStorage([record('A'),record('B',T.DEAN,S.CRITICAL)]));
 assert.equal(store.overrideComplaintRouting('A',T.HOD,reason,T.HIGHER_AUTH).success,true);
 assert.ok(store.getComplaints().every(c=>c.assignedAuthority===T.HOD && c.auditLogs.length===2));
});
test('Cross-tier linked members are checked individually', () => {
 const mem = new MemoryStorage([record('A',T.HOD),record('B',T.DEAN)]), store = new AegisStore(mem), raw = mem.raw;
 assert.equal(store.overrideComplaintRouting('A',T.HIGHER_AUTH,reason,T.HOD).success,false); assert.equal(mem.raw,raw);
});
test('Case-group matching is normalized for overrides', () => {
 const store = new AegisStore(new MemoryStorage([record('A',T.HOD,S.LOW,'Pending',' group '),record('B',T.HOD,S.LOW,'Pending','GROUP')]));
 assert.equal(store.overrideComplaintRouting('A',T.DEAN,reason,T.HOD).success,true); assert.ok(store.getComplaints().every(c=>c.assignedAuthority===T.DEAN));
});
test('Unlinked records remain unchanged after override', () => {
 const isolated = record('C',T.HOD,S.LOW,'Pending','OTHER'), store = new AegisStore(new MemoryStorage([record('A'),isolated]));
 store.overrideComplaintRouting('A',T.HIGHER_AUTH,reason,T.DEAN);
 assert.equal(store.getComplaintById('C').assignedAuthority,T.HOD); assert.equal(store.getComplaintById('C').auditLogs.length,1);
});
test('Each linked audit entry records its own previous tier', () => {
 const store = new AegisStore(new MemoryStorage([record('A',T.HOD),record('B',T.DEAN)]));
 store.overrideComplaintRouting('A',T.HIGHER_AUTH,reason,T.HIGHER_AUTH);
 assert.match(store.getComplaintById('A').auditLogs.at(-1).remarks,/from HOD/);
 assert.match(store.getComplaintById('B').auditLogs.at(-1).remarks,/from Dean/);
});
test('Resolved and active workflow states survive routing overrides', () => {
 const store = new AegisStore(new MemoryStorage([record('A',T.DEAN,S.LOW,'Resolved'),record('B',T.DEAN,S.LOW,'Under Investigation')]));
 store.overrideComplaintRouting('A',T.HIGHER_AUTH,reason,T.DEAN);
 assert.equal(store.getComplaintById('A').status,'Resolved'); assert.equal(store.getComplaintById('B').status,'Under Investigation');
});
test('Unknown actor cannot override even upwards',()=>assert.equal(validateManualOverride(record('A'),T.HIGHER_AUTH,reason,'Fake role').valid,false));
test('HOD cannot act on a Dean case',()=>assert.equal(validateManualOverride(record('A'),T.HIGHER_AUTH,reason,T.HOD).valid,false));
test('Invalid routing tier is rejected',()=>assert.equal(validateManualOverride(record('A'),'Unknown',reason,T.DEAN).valid,false));
test('Short override rationale is rejected',()=>assert.equal(validateManualOverride(record('A'),T.HOD,'short',T.DEAN).valid,false));
test('Assigned role can advance status through the complete workflow',()=>{
 const store=new AegisStore(new MemoryStorage([record('A',T.HOD,S.LOW,'Pending')]));
 for(const status of ['In Review','Under Investigation','Action Taken','Resolved']) store.updateComplaintStatus('A',status,reason,T.HOD);
 assert.equal(store.getComplaintById('A').status,'Resolved'); assert.equal(store.getComplaintById('A').auditLogs.length,5);
});
test('Higher Authority can advance a lower-tier case',()=>{
 const store=new AegisStore(new MemoryStorage([record('A')]));
 assert.equal(store.updateComplaintStatus('A','Under Investigation',reason,T.HIGHER_AUTH).status,'Under Investigation');
});
test('Status skip is blocked without persistence',()=>{
 const mem=new MemoryStorage([record('A',T.HOD,S.LOW,'Pending')]), store=new AegisStore(mem),raw=mem.raw;
 assert.throws(()=>store.updateComplaintStatus('A','Resolved',reason,T.HOD),/transition/); assert.equal(mem.raw,raw);
});
test('Backwards and same-state transitions are blocked',()=>{
 const store=new AegisStore(new MemoryStorage([record('A')]));
 for(const next of ['Pending','In Review']) assert.throws(()=>store.updateComplaintStatus('A',next,reason,T.DEAN),/transition/);
});
test('Resolved cases have no permitted Stage 2.0 transition',()=>assert.deepEqual(allowedStatusTransitions(record('A',T.DEAN,S.LOW,'Resolved'),T.DEAN),[]));
test('Wrong-tier status update is blocked',()=>{
 const store=new AegisStore(new MemoryStorage([record('A')]));
 assert.throws(()=>store.updateComplaintStatus('A','Under Investigation',reason,T.HOD),/Permission/);
});
test('Missing remarks are rejected',()=>{
 const store=new AegisStore(new MemoryStorage([record('A')]));
 assert.throws(()=>store.updateComplaintStatus('A','Under Investigation',' ',T.DEAN),/remarks/);
});
test('PIN validator requires exactly six digits',()=> {
 for(const pin of ['1234','12345','1234567','abcdef','12345x','']) assert.equal(isValidVerificationPin(pin),false);
 assert.equal(isValidVerificationPin('123456'),true);
});
test('Store rejects malformed PINs independently of UI',()=>{
 const store=new AegisStore(new MemoryStorage([record('A')]));
 for(const pin of ['1234','abcdef','1234567']) assert.equal(store.getComplaintByCredentials('AEG-2026-A',pin),null);
});
test('Legacy reference credentials remain case-insensitive',()=>{
 const store=new AegisStore(new MemoryStorage([record('A')]));
 assert.ok(store.getComplaintByCredentials(' aeg-2026-a ',' 123456 '));
});
test('Reference allocation retries a forced collision',()=>{
 let calls=0;
 const reference=generateReferenceId(['AEG-2030-AAAA'],2030,()=>calls++<4?0:1/32);
 assert.equal(reference,'AEG-2030-BBBB');
});
test('Reference allocation exhausts safely without duplicate',()=>assert.throws(()=>generateReferenceId(['AEG-2030-AAAA'],2030,()=>0),/unique reference/));
test('New records use unique internal IDs',()=>{
 const store=new AegisStore(new MemoryStorage());
 const input={category:'General Campus Grievance',description:'Fictional scheduling complaint for a demonstration.',identityMode:'anonymous'};
 const first=store.saveComplaint(input),second=store.saveComplaint(input);
 assert.notEqual(first.id,second.id); assert.notEqual(first.referenceId,second.referenceId);
});
test('Anonymous input does not persist reporter identity',()=>{
 const store=new AegisStore(new MemoryStorage());
 const result=store.saveComplaint({category:'General Campus Grievance',identityMode:'anonymous',reporterName:'Fictional person',reporterContact:'fiction@example.test'});
 assert.equal(result.reporterName,''); assert.equal(result.reporterContact,'');
});
test('Actual legacy normalization is read-only',()=>{
 const legacy=record('A'); delete legacy.severity; delete legacy.urgency;
 const mem=new MemoryStorage([legacy]), raw=mem.raw,store=new AegisStore(mem),result=store.getComplaints()[0];
 assert.equal(result.severity,S.LOW); assert.equal(result.urgency,'Routine'); assert.equal(mem.raw,raw);
});
test('Malformed JSON survives reads and failed submissions',()=>{
 const mem=new MemoryStorage(); mem.raw='{broken';
 const store=new AegisStore(mem); assert.deepEqual(store.getComplaints(),[]); assert.ok(store.lastError);
 assert.throws(()=>store.saveComplaint({category:'General Campus Grievance'}),/preserved/); assert.equal(mem.raw,'{broken'); assert.equal(mem.writes,0);
});
test('Invalid record schema is preserved rather than reset',()=>{
 const mem=new MemoryStorage([null]),store=new AegisStore(mem),raw=mem.raw;
 assert.deepEqual(store.getComplaints(),[]); assert.throws(()=>store.saveComplaint({}),/preserved/); assert.equal(mem.raw,raw);
});
test('Storage read errors cannot turn into destructive writes',()=>{
 const mem=new MemoryStorage([record('A')]),store=new AegisStore(mem),raw=mem.raw; mem.failRead=true;
 assert.throws(()=>store.saveComplaint({}),/preserved/); assert.equal(mem.raw,raw); assert.equal(mem.writes,0);
});
test('Submission quota failure preserves all existing records',()=>{
 const mem=new MemoryStorage([record('A')]),store=new AegisStore(mem),raw=mem.raw; mem.failWrite=true;
 assert.throws(()=>store.saveComplaint({category:'General Campus Grievance'}),/Could not save/); assert.equal(mem.raw,raw); assert.ok(store.lastError);
});
test('Status write failure reports failure without persisted change',()=>{
 const mem=new MemoryStorage([record('A')]),store=new AegisStore(mem),raw=mem.raw; mem.failWrite=true;
 assert.throws(()=>store.updateComplaintStatus('A','Under Investigation',reason,T.DEAN),/Could not save/); assert.equal(mem.raw,raw);
});
test('Override write failure reports failure without partial changes',()=>{
 const mem=new MemoryStorage([record('A'),record('B')]),store=new AegisStore(mem),raw=mem.raw; mem.failWrite=true;
 assert.throws(()=>store.overrideComplaintRouting('A',T.HIGHER_AUTH,reason,T.DEAN),/Could not save/); assert.equal(mem.raw,raw);
});
test('Failed reset preserves existing data',()=>{
 const mem=new MemoryStorage([record('A')]),store=new AegisStore(mem),raw=mem.raw; mem.failWrite=true;
 assert.throws(()=>store.resetToSeedData(),/Could not save/); assert.equal(mem.raw,raw);
});
test('Unavailable storage does not prevent module or store initialization',()=>{
 const mem=new MemoryStorage(); mem.failRead=true;
 const store=new AegisStore(mem); assert.ok(store.lastError); assert.deepEqual(store.getComplaints(),[]);
});
console.log('BASELINE SUMMARY: '+passed+' passed, '+failed+' failed');
process.exitCode=failed?1:0;
