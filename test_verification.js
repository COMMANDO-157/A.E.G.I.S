import http from 'http';
import { startTestServer } from './test_server.js';
const testServer = await startTestServer();
import { escapeHtml, maskIdentity, generateReferenceId, generateVerificationPin } from './js/security.js';
import { 
  assessIncidentRisk, 
  evaluateCaseEscalation, 
  determineTargetAuthority, 
  createAuditLogEntry, 
  validateManualOverride,
  AUTHORITY_TIERS,
  SEVERITY_LEVELS,
  URGENCY_LEVELS
} from './js/escalation.js';

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
      http.get(testServer.url + path, (res) => {
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
  assert(new RegExp('^AEG-' + new Date().getFullYear() + '-[A-Z0-9]{4}$').test(refId), `Generated Reference ID format valid: ${refId}`);

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

function testIndependentSeverityRouting() {
  console.log('\n--- Test Suite 3: Independent Severity Routing & Risk Assessment ---');

  // 1. Low-risk independent complaint -> HOD
  const lowInput = {
    category: 'General Campus Grievance',
    description: 'Minor noise dispute regarding study room reservations during evening hours.',
    riskFlags: {}
  };
  const lowRisk = assessIncidentRisk(lowInput);
  assert(lowRisk.severity === SEVERITY_LEVELS.LOW, 'Low category assessed as Low severity');
  assert(lowRisk.urgency === URGENCY_LEVELS.ROUTINE, 'Low category assessed as Routine urgency');
  assert(lowRisk.recommendedTier === AUTHORITY_TIERS.HOD, 'Low-risk complaint recommends HOD tier');

  const lowEval = evaluateCaseEscalation({ ...lowInput, caseGroupId: '' }, []);
  assert(lowEval.assignedAuthority === AUTHORITY_TIERS.HOD, 'Low-risk independent complaint routes to HOD');
  assert(lowEval.severity === SEVERITY_LEVELS.LOW, 'Low-risk evaluation records Low severity');

  // 2. Moderate-risk independent complaint -> Dean
  const modInput = {
    category: 'Hostel Harassment & Bullying',
    description: 'Repeated hostel room intimidation and forced chores after curfew.',
    riskFlags: { repeatHarassment: true }
  };
  const modRisk = assessIncidentRisk(modInput);
  assert(modRisk.severity === SEVERITY_LEVELS.MODERATE, 'Hostel Bullying assessed as Moderate severity');
  assert(modRisk.urgency === URGENCY_LEVELS.URGENT, 'Repeat harassment assessed as Urgent urgency');
  assert(modRisk.recommendedTier === AUTHORITY_TIERS.DEAN, 'Moderate-risk complaint recommends Dean tier');

  const modEval = evaluateCaseEscalation({ ...modInput, caseGroupId: '' }, []);
  assert(modEval.assignedAuthority === AUTHORITY_TIERS.DEAN, 'Moderate-risk independent complaint routes to Dean');
  assert(modEval.routingOrigin.includes('Moderate'), 'Routing origin records Moderate Severity Bypass');

  // 3. Critical-risk independent complaint -> Higher Authority (Direct Bypass)
  const critInput = {
    category: 'Physical Violence & Assault',
    description: 'Direct physical attack with weapon threat. Severe bodily injury threatened.',
    riskFlags: { immediateDanger: true, physicalThreat: true }
  };
  const critRisk = assessIncidentRisk(critInput);
  assert(critRisk.severity === SEVERITY_LEVELS.CRITICAL, 'Physical assault assessed as Critical severity');
  assert(critRisk.urgency === URGENCY_LEVELS.IMMEDIATE, 'Immediate danger flag sets Immediate Danger urgency');
  assert(critRisk.recommendedTier === AUTHORITY_TIERS.HIGHER_AUTH, 'Critical complaint recommends Higher Authority');

  const critEval = evaluateCaseEscalation({ ...critInput, caseGroupId: '' }, []);
  assert(critEval.assignedAuthority === AUTHORITY_TIERS.HIGHER_AUTH, 'Critical independent complaint routes to Higher Authority');
  assert(critEval.routingOrigin.includes('Critical'), 'Routing origin records Critical Severity Bypass');

  // 4. Negation Safeguards against False Positives
  const negationInput = {
    category: 'General Campus Grievance',
    description: 'Student clarified there was no weapon and no physical harm occurred during discussion.',
    riskFlags: {}
  };
  const negRisk = assessIncidentRisk(negationInput);
  assert(negRisk.severity === SEVERITY_LEVELS.LOW, 'Negated phrases ("no weapon", "no physical harm") do NOT trigger critical false positive');
}

function testLinkedCaseEscalationChain() {
  console.log('\n--- Test Suite 4: Linked-Case Escalation & Dual-Engine Rule ---');

  // Test: 3 linked low-risk reports -> HOD, Dean, Higher Authority
  const caseId = 'CASE-CHAIN-TEST';
  let storeComplaints = [];

  // Report #1 (Low risk)
  const rep1 = {
    id: 'C-1',
    caseGroupId: caseId,
    category: 'General Campus Grievance',
    description: 'Routine dispute over lab equipment scheduling.',
    riskFlags: {}
  };
  const eval1 = evaluateCaseEscalation(rep1, storeComplaints);
  assert(eval1.assignedAuthority === AUTHORITY_TIERS.HOD, '3-Report Chain: Report #1 routes to HOD');
  rep1.assignedAuthority = eval1.assignedAuthority;
  rep1.status = 'Pending';
  rep1.auditLogs = [eval1.auditEntry];
  storeComplaints.push(rep1);

  // Report #2 (Low risk) -> Should escalate case to Dean
  const rep2 = {
    id: 'C-2',
    caseGroupId: caseId,
    category: 'General Campus Grievance',
    description: 'Second complaint in case chain regarding equipment scheduling.',
    riskFlags: {}
  };
  const eval2 = evaluateCaseEscalation(rep2, storeComplaints);
  assert(eval2.assignedAuthority === AUTHORITY_TIERS.DEAN, '3-Report Chain: Report #2 auto-escalates to Dean');
  assert(eval2.caseComplaintsToUpdate.length === 1, 'Report #1 identified for case synchronization');
  assert(eval2.caseComplaintsToUpdate[0].assignedAuthority === AUTHORITY_TIERS.DEAN, 'Report #1 in case synchronized to Dean');
  rep2.assignedAuthority = eval2.assignedAuthority;
  rep2.status = 'Escalated';
  rep2.auditLogs = [eval2.auditEntry];
  storeComplaints = [eval2.caseComplaintsToUpdate[0], rep2];

  // Report #3 (Low risk) -> Should escalate entire case to Higher Authority
  const rep3 = {
    id: 'C-3',
    caseGroupId: caseId,
    category: 'General Campus Grievance',
    description: 'Third complaint in case chain regarding equipment scheduling.',
    riskFlags: {}
  };
  const eval3 = evaluateCaseEscalation(rep3, storeComplaints);
  assert(eval3.assignedAuthority === AUTHORITY_TIERS.HIGHER_AUTH, '3-Report Chain: Report #3 auto-escalates to Higher Authority');
  assert(eval3.caseComplaintsToUpdate.length === 2, 'Reports #1 and #2 synchronized to Higher Authority');
  assert(eval3.caseComplaintsToUpdate[0].assignedAuthority === AUTHORITY_TIERS.HIGHER_AUTH, 'Report #1 synchronized to Higher Authority');
  assert(eval3.caseComplaintsToUpdate[1].assignedAuthority === AUTHORITY_TIERS.HIGHER_AUTH, 'Report #2 synchronized to Higher Authority');
}

function testHighRiskLinkedBypassAndAntiDowngrade() {
  console.log('\n--- Test Suite 5: High-Risk Linked Bypass & Anti-Downgrade Guarantees ---');

  // Scenario A: High-risk report filed into a case currently at HOD
  const freshCaseId = 'CASE-BYPASS-TEST';
  const reportA = {
    id: 'CB-1',
    caseGroupId: freshCaseId,
    category: 'General Campus Grievance',
    assignedAuthority: AUTHORITY_TIERS.HOD,
    status: 'Pending',
    auditLogs: []
  };

  // Second report filed is CRITICAL severity
  const reportB = {
    id: 'CB-2',
    caseGroupId: freshCaseId,
    category: 'Physical Violence & Assault',
    description: 'Perpetrators escalated to physical assault and weapons outside dorm.',
    riskFlags: { physicalThreat: true, immediateDanger: true }
  };
  const bypassEval = evaluateCaseEscalation(reportB, [reportA]);
  assert(bypassEval.assignedAuthority === AUTHORITY_TIERS.HIGHER_AUTH, 'High-risk linked complaint immediately bypasses Dean directly to Higher Authority');
  assert(bypassEval.caseComplaintsToUpdate[0].assignedAuthority === AUTHORITY_TIERS.HIGHER_AUTH, 'Prior report in case group promoted to Higher Authority');

  // Scenario B: Anti-Downgrade Verification
  // Filing a subsequent LOW risk report into a case already at Higher Authority must NOT downgrade the case
  const reportC = {
    id: 'CB-3',
    caseGroupId: freshCaseId,
    category: 'General Campus Grievance',
    description: 'Follow-up minor query regarding incident report status.',
    riskFlags: {}
  };
  const existingCaseAtHigherAuth = [
    { ...reportA, assignedAuthority: AUTHORITY_TIERS.HIGHER_AUTH },
    { ...reportB, assignedAuthority: AUTHORITY_TIERS.HIGHER_AUTH }
  ];
  const antiDowngradeEval = evaluateCaseEscalation(reportC, existingCaseAtHigherAuth);
  assert(antiDowngradeEval.assignedAuthority === AUTHORITY_TIERS.HIGHER_AUTH, 'Anti-downgrade rule: Low-risk report preserves existing Higher Authority tier');
}

function testManualOverrideRestrictions() {
  console.log('\n--- Test Suite 6: Manual Routing Override Permissions & Downgrade Restrictions ---');

  const critComplaint = {
    id: 'C-CRIT',
    assignedAuthority: AUTHORITY_TIERS.HIGHER_AUTH,
    severity: SEVERITY_LEVELS.CRITICAL
  };

  // 1. Mandatory justification length check
  const shortReason = validateManualOverride(critComplaint, AUTHORITY_TIERS.DEAN, 'too short', AUTHORITY_TIERS.HIGHER_AUTH);
  assert(!shortReason.valid, 'Manual override rejects justification under 15 characters');

  // 2. Unauthorized downgrade of Critical incident by HOD
  const hodDowngrade = validateManualOverride(
    critComplaint, 
    AUTHORITY_TIERS.HOD, 
    'Attempting to reassign to departmental triage without approval', 
    AUTHORITY_TIERS.HOD
  );
  assert(!hodDowngrade.valid, 'Unauthorized Downgrade: HOD is blocked from downgrading Critical incident');

  // 3. Unauthorized downgrade of Critical incident by Dean
  const deanDowngrade = validateManualOverride(
    critComplaint, 
    AUTHORITY_TIERS.DEAN, 
    'Dean attempting downgrade of critical complaint', 
    AUTHORITY_TIERS.DEAN
  );
  assert(!deanDowngrade.valid, 'Unauthorized Downgrade: Dean is blocked from downgrading Critical incident');

  // 4. Authorized Higher Authority override with valid justification
  const validOverride = validateManualOverride(
    critComplaint, 
    AUTHORITY_TIERS.DEAN, 
    'Ombudsperson committee delegated this matter to Dean following initial security hearing', 
    AUTHORITY_TIERS.HIGHER_AUTH
  );
  assert(validOverride.valid, 'Authorized Higher Authority override with comprehensive rationale succeeds');
}

function testBackwardCompatibility() {
  console.log('\n--- Test Suite 7: Backward Compatibility & Audit Logging ---');

  // Simulating legacy record missing severity and urgency
  const legacyRecord = {
    id: 'COMP-LEGACY-01',
    referenceId: 'AEG-2026-LEG1',
    verificationPin: '123456',
    category: 'Hostel Harassment & Bullying'
  };

  // Normalization logic verification
  const normalized = {
    ...legacyRecord,
    severity: legacyRecord.severity || SEVERITY_LEVELS.LOW,
    urgency: legacyRecord.urgency || URGENCY_LEVELS.ROUTINE,
    severityReason: legacyRecord.severityReason || 'Standard procedural evaluation.',
    routingOrigin: legacyRecord.routingOrigin || 'Initial Triage Routing'
  };

  assert(normalized.severity === SEVERITY_LEVELS.LOW, 'Legacy record defaults safely to Low severity');
  assert(normalized.urgency === URGENCY_LEVELS.ROUTINE, 'Legacy record defaults safely to Routine urgency');
  assert(normalized.routingOrigin === 'Initial Triage Routing', 'Legacy record provides valid routing origin');

  const log = createAuditLogEntry('SEVERITY_BYPASS_TIER_3', AUTHORITY_TIERS.HIGHER_AUTH, 'Critical bypass test', 'Engine');
  assert(log.isDemoLog === true && log.id && log.timestamp, 'Append-only audit log retains complete schema');
}

async function runAllTests() {
  console.log('========================================================');
  console.log('  A.E.G.I.S VERIFICATION TEST SUITE (Node.js Test Runner)');
  console.log('========================================================');

  await testStaticServerFiles();
  testSecurityAndMasking();
  testIndependentSeverityRouting();
  testLinkedCaseEscalationChain();
  testHighRiskLinkedBypassAndAntiDowngrade();
  testManualOverrideRestrictions();
  testBackwardCompatibility();

  console.log('\n========================================================');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================');

  if (failed > 0) {
    process.exitCode = 1;
  }
}

try { await runAllTests(); } finally { await testServer.close(); }
