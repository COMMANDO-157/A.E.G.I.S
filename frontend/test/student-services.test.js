import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudentServicesRehearsal} from '../src/utils/student-services.ts';

test('Service lifecycle requires correct actor, version and sequence',()=>{
 const d=createStudentServicesRehearsal(),r=d.request('student','academic');
 assert.throws(()=>d.transition('student',r.id,1,'completed'));
 assert.throws(()=>d.transition('owner',r.id,1,'acknowledged'));
 assert.throws(()=>d.transition('service-officer',r.id,1,'completed'));
 const a=d.transition('service-officer',r.id,1,'acknowledged');
 assert.throws(()=>d.transition('service-officer',r.id,1,'completed'));
 assert.equal(d.transition('service-officer',r.id,a.version,'completed').state,'completed');
 assert.throws(()=>d.transition('student',r.id,3,'cancelled'));
});
test('Duplicate open requests, unknown category and other student access are rejected',()=>{
 const d=createStudentServicesRehearsal();
 assert.throws(()=>d.request('other-student','academic'));
 assert.throws(()=>d.request('student','personal narrative'));
 const r=d.request('student','academic');
 assert.throws(()=>d.request('student','academic'));
 assert.throws(()=>d.list('other-student'));
 d.transition('student',r.id,1,'cancelled');
 assert.equal(d.request('student','academic').state,'requested');
});
test('Support never appears in service records; owner/officer/other student cannot read support',()=>{
 const d=createStudentServicesRehearsal();
 assert.throws(()=>d.requestSupport('student',false));
 assert.throws(()=>d.requestSupport('student','yes'));
 d.requestSupport('student',true);
 assert.deepEqual(d.list('service-officer'),[]);
 for(const actor of ['owner','service-officer','other-student'])assert.throws(()=>d.readSupport(actor));
 assert.equal(d.readSupport('support-worker').state,'requested');
});
test('Consent withdrawal immediately denies worker access and stale acknowledgment',()=>{
 const d=createStudentServicesRehearsal(),r=d.requestSupport('student',true);
 d.withdrawSupport('student');
 assert.throws(()=>d.readSupport('support-worker'));
 assert.throws(()=>d.acknowledgeSupport('support-worker',r.version));
 assert.equal(d.readSupport('student').state,'withdrawn');
 const fresh=d.requestSupport('student',true);
 assert.ok(fresh.version>r.version);
 assert.throws(()=>d.acknowledgeSupport('support-worker',r.version));
 assert.equal(d.acknowledgeSupport('support-worker',fresh.version).state,'acknowledged');
});
test('Disclosures, exports and deletion remain closed pending institutional decisions',()=>{
 const d=createStudentServicesRehearsal();d.requestSupport('student',true);
 for(const method of ['discloseSupport','exportSupport','deleteRecords'])assert.throws(()=>d[method]());
});
test('Returned objects and audit snapshots cannot mutate stored sample state',()=>{
 const d=createStudentServicesRehearsal(),r=d.request('student','academic');r.state='completed';
 const s=d.requestSupport('student',true);s.consent=false;
 const a=d.audit();a[0].action='forged';
 assert.equal(d.list('student')[0].state,'requested');
 assert.equal(d.readSupport('support-worker').consent,true);
 assert.equal(d.audit()[0].action,'requested');
 assert.deepEqual(Object.keys(d.audit()[0]).sort(),['action','domain']);
 assert.deepEqual(createStudentServicesRehearsal().list('student'),[]);
});
