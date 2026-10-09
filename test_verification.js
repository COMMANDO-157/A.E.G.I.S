import http from 'http';
import { escapeHtml, maskIdentity, generateReferenceId, generateVerificationPin } from './js/security.js';
import { evaluateCaseEscalation, determineTargetAuthority, createAuditLogEntry, AUTHORITY_TIERS } from './js/escalation.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function testStaticServerFiles() {
  console.log('\n--- Test Suite 1: HTTP Server & Static Assets ---');
  const files = [
    '/',
    '/css/variables.css',
    '/css/base.css',
    '/css/components.css',
    '/css/views.css',
    '/js/app.js',
    '/js/store.js',
    '/js/escalation.js',
    '/js/security.js',
    '/js/ui.js',
    '/js/views/home.js',
    '/js/views/report.js',
    '/js/views/track.js',
    '/js/views/dashboard.js'
  ];

  for (const path of files) {
    await new Promise((resolve) => {
      http.get(`http://127.0.0.1:5500${path}`, (res) => {
        assert(res.statusCode === 200, `HTTP GET ${path} returned 200 OK`);
        resolve();
      }).on('error', (err) => {
        assert(false, `HTTP GET ${path} failed: ${err.message}`);
        resolve();
      });
    });
  }
}

function testSecurityAndMasking() {
  console.log('\n--- Test Suite 2: Security, Sanitization & Identity Masking ---');

  // HTML escaping
  const rawInput = '<script>alert("xss")</script>&"\'';
  const escaped = escapeHtml(rawInput);
  assert(!escaped.includes('<script>'), 'Strict HTML escaping removes raw tags');
  assert(escaped.includes('&lt;script&gt;'), 'Tags are converted to HTML entities');

  // ID and PIN format
  const refId = generateReferenceId();
  assert(/^AEG-2026-[A-Z0-9]{4}$/.test(refId), `Generated Reference ID format valid: ${refId}`);

  const pin = generateVerificationPin();
  assert(/^\d{6}$/.test(pin), `Generated 6-digit Verification PIN valid: ${pin}`);

  // Masking Scenario A: Anonymous Report
  const anonComplaint = {
    identityMode: 'anonymous',
    reporterName: 'Secret Person',
    reporterContact: 'secret@campus.edu'
  };
  const anonHod = maskIdentity(anonComplaint, AUTHORITY_TIERS.HOD);
  const anonDean = maskIdentity(anonComplaint, AUTHORITY_TIERS.DEAN);
  const anonHigher = maskIdentity(anonComplaint, AUTHORITY_TIERS.HIGHER_AUTH);
  assert(anonHod.isMasked && anonDean.isMasked && anonHigher.isMasked, 'Anonymous mode is masked for ALL tiers including Higher Authority');

  // Masking Scenario B: Confidential Whistleblower Report
  const confComplaint = {
    identityMode: 'confidential',
    reporterName: 'Priya Sharma',
    reporterContact: 'priya@campus.edu',
    reporterDepartment: 'Mechanical 3rd Year'
  };
  const confHod = maskIdentity(confComplaint, AUTHORITY_TIERS.HOD);
  const confDean = maskIdentity(confComplaint, AUTHORITY_TIERS.DEAN);
  const confHigher = maskIdentity(confComplaint, AUTHORITY_TIERS.HIGHER_AUTH);

  assert(confHod.isMasked, 'Confidential report identity IS MASKED from HOD');
  assert(!confHod.displayText.includes('Priya'), 'HOD view contains no reporter name');
  assert(confDean.isMasked, 'Confidential report identity IS MASKED from Dean');
  assert(!confDean.displayText.includes('Priya'), 'Dean view contains no reporter name');
  assert(!confHigher.isMasked, 'Confidential report identity IS UNMASKED for Higher Authority');
  assert(confHigher.displayText.includes('Priya Sharma'), 'Higher Authority view contains whistleblower name');

  // Masking Scenario C: Standard Report
  const stdComplaint = {
    identityMode: 'standard',
    reporterName: 'Amit Roy',
    reporterContact: '+91 9876543210'
  };
  const stdHod = maskIdentity(stdComplaint, AUTHORITY_TIERS.HOD);
  assert(!stdHod.isMasked && stdHod.displayText.includes('Amit Roy'), 'Standard report is visible to all tiers');
}

function testEscalationEngine() {
  console.log('\n--- Test Suite 3: Deterministic Escalation Engine (1st: HOD -> 2nd: Dean -> 3rd+: Higher Auth) ---');

  // Target authority determination
  assert(determineTargetAuthority(1) === AUTHORITY_TIERS.HOD, '1st report routes to HOD');
  assert(determineTargetAuthority(2) === AUTHORITY_TIERS.DEAN, '2nd report routes to Dean');
  assert(determineTargetAuthority(3) === AUTHORITY_TIERS.HIGHER_AUTH, '3rd report routes to Higher Authority');
  assert(determineTargetAuthority(4) === AUTHORITY_TIERS.HIGHER_AUTH, '4th report routes to Higher Authority');

  // Simulation of 3 reports linked to one demo case (CASE-TEST-ESCALATION)
  const caseGroupId = 'CASE-TEST-ESCALATION';
  let complaintsStore = [];

  // Report #1
  const report1 = {
    id: 'COMP-T1',
    caseGroupId,
    category: 'Bullying',
    status: 'Pending',
    auditLogs: []
  };
  const res1 = evaluateCaseEscalation(report1, complaintsStore);
  assert(res1.assignedAuthority === AUTHORITY_TIERS.HOD, 'Report #1 assigned to HOD');
  assert(res1.caseComplaintsToUpdate.length === 0, 'No prior complaints to update for report #1');
  report1.assignedAuthority = res1.assignedAuthority;
  report1.auditLogs.push(res1.auditEntry);
  complaintsStore.push(report1);

  // Report #2
  const report2 = {
    id: 'COMP-T2',
    caseGroupId,
    category: 'Bullying',
    status: 'Pending',
    auditLogs: []
  };
  const res2 = evaluateCaseEscalation(report2, complaintsStore);
  assert(res2.assignedAuthority === AUTHORITY_TIERS.DEAN, 'Report #2 automatically escalated to Dean');
  assert(res2.caseComplaintsToUpdate.length === 1, 'Previous complaint in case group identified for synchronization');
  assert(res2.caseComplaintsToUpdate[0].assignedAuthority === AUTHORITY_TIERS.DEAN, 'Report #1 in case synchronized to Dean');
  assert(res2.caseComplaintsToUpdate[0].status === 'Escalated', 'Report #1 status marked as Escalated');
  report2.assignedAuthority = res2.assignedAuthority;
  report2.auditLogs.push(res2.auditEntry);
  // update store
  complaintsStore = [res2.caseComplaintsToUpdate[0], report2];

  // Report #3
  const report3 = {
    id: 'COMP-T3',
    caseGroupId,
    category: 'Bullying',
    status: 'Pending',
    auditLogs: []
  };
  const res3 = evaluateCaseEscalation(report3, complaintsStore);
  assert(res3.assignedAuthority === AUTHORITY_TIERS.HIGHER_AUTH, 'Report #3 automatically escalated to Higher Authority');
  assert(res3.caseComplaintsToUpdate.length === 2, 'Both prior complaints in case identified for synchronization');
  assert(res3.caseComplaintsToUpdate[0].assignedAuthority === AUTHORITY_TIERS.HIGHER_AUTH, 'Report #1 synchronized to Higher Authority');
  assert(res3.caseComplaintsToUpdate[1].assignedAuthority === AUTHORITY_TIERS.HIGHER_AUTH, 'Report #2 synchronized to Higher Authority');
  assert(res3.auditEntry.action.includes('CRITICAL_AUTO_ESCALATION'), 'Critical auto-escalation logged in audit entry');
}

function testAuditLoggingAndIndependence() {
  console.log('\n--- Test Suite 4: Append-Only Demo Audit Logs & Independent Cases ---');

  // Independent report with no caseGroupId
  const independentReport = {
    id: 'COMP-INDEP',
    caseGroupId: '',
    category: 'Lab Safety'
  };
  const indepRes = evaluateCaseEscalation(independentReport, []);
  assert(indepRes.assignedAuthority === AUTHORITY_TIERS.HOD, 'Independent report defaults to HOD');

  // Audit entry format
  const log = createAuditLogEntry('TEST_ACTION', AUTHORITY_TIERS.HOD, 'Test remarks', 'Tester');
  assert(log.id && log.timestamp && log.displayTime, 'Audit entry has id, timestamp, displayTime');
  assert(log.isDemoLog === true, 'Audit entry clearly labeled as isDemoLog');
  assert(log.actor === 'Tester' && log.remarks === 'Test remarks', 'Actor and remarks preserved');
}

async function runAllTests() {
  console.log('========================================================');
  console.log('  A.E.G.I.S VERIFICATION TEST SUITE (Node.js Test Runner)');
  console.log('========================================================');

  await testStaticServerFiles();
  testSecurityAndMasking();
  testEscalationEngine();
  testAuditLoggingAndIndependence();

  console.log('\n========================================================');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();
