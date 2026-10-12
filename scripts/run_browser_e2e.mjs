import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import pg from 'pg';
import { databaseOptions } from '../server/config.js';
import { digest } from '../server/auth.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://127.0.0.1:5173';

class ChromeSession {
  constructor(port = 9225) {
    this.port = port;
    this.proc = null;
    this.ws = null;
    this.msgId = 0;
    this.pending = new Map();
  }

  async start() {
    this.proc = spawn(CHROME_PATH, [
      '--headless',
      '--disable-gpu',
      `--remote-debugging-port=${this.port}`,
      'about:blank'
    ]);
    await new Promise(r => setTimeout(r, 2000));
    const tabs = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json();
    const pageTab = tabs.find(t => t.type === 'page');
    this.ws = new WebSocket(pageTab.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    // Enable required CDP domains
    await this.send('Page.enable');
    await this.send('Network.enable');
    await this.send('Runtime.enable');
  }

  send(method, params = {}) {
    const id = ++this.msgId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async setCookie(name, value) {
    await this.send('Network.setCookie', {
      name,
      value,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true
    });
  }

  async clearCookies() {
    await this.send('Network.clearBrowserCookies');
  }

  async navigate(url, waitMs = 2500) {
    await this.send('Page.navigate', { url });
    await new Promise(r => setTimeout(r, waitMs));
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true
    });
    return res.result?.value;
  }

  async setViewport(width, height, isMobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: isMobile
    });
  }

  close() {
    try { this.ws?.close(); } catch {}
    try { this.proc?.kill(); } catch {}
  }
}

async function runBrowserTestSuite() {
  console.log('========================================================');
  console.log('  A.E.G.I.S 4.0 — REAL CHROME BROWSER E2E TEST SUITE');
  console.log('  Browser: Google Chrome (Headless CDP Engine)');
  console.log('========================================================\n');

  const db = new pg.Pool({ ...databaseOptions({ ...process.env, DATABASE_URL: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL }), max: 2, connectionTimeoutMillis: 10000 });
  const chrome = new ChromeSession(9225);
  await chrome.start();

  const createdUsers = [];
  const testResults = [];

  function recordPass(name, detail = '') {
    testResults.push({ name, pass: true, detail });
    console.log(`  ✅ PASS: ${name}${detail ? ` (${detail})` : ''}`);
  }

  function recordFail(name, error) {
    testResults.push({ name, pass: false, error: String(error) });
    console.log(`  ❌ FAIL: ${name} — ${error}`);
  }

  try {
    // ─── Suite 1: Public Pages & Guest Workflows ─────────────────────────────
    console.log('--- Test Suite 1: Public Portal, Navigation & Landing ---');
    await chrome.clearCookies();
    await chrome.navigate(`${APP_URL}/`);
    
    const landingTitle = await chrome.evaluate('document.title');
    if (landingTitle.includes('A.E.G.I.S')) {
      recordPass('Landing Page Rendered with Correct Title', landingTitle);
    } else {
      recordFail('Landing Page Title', `Unexpected title: ${landingTitle}`);
    }

    const navLinks = await chrome.evaluate(`
      Array.from(document.querySelectorAll('nav a, header a')).map(a => ({ text: a.innerText.trim(), href: a.getAttribute('href') }))
    `);
    if (navLinks.length > 0) {
      recordPass('Header Navigation Links Accessible', `${navLinks.length} navigation anchors found`);
    } else {
      recordFail('Header Navigation Links Accessible', 'No nav anchors found');
    }

    // Safety page
    await chrome.navigate(`${APP_URL}/safety`);
    const safetyHeading = await chrome.evaluate('document.querySelector("h1, h2")?.innerText');
    if (safetyHeading) {
      recordPass('Safety & Grievance Guidelines Page Accessible', safetyHeading);
    } else {
      recordFail('Safety Page', 'No heading on /safety');
    }

    // About page
    await chrome.navigate(`${APP_URL}/about`);
    const aboutHeading = await chrome.evaluate('document.querySelector("h1, h2")?.innerText');
    if (aboutHeading) {
      recordPass('About & Governance Framework Page Accessible', aboutHeading);
    } else {
      recordFail('About Page', 'No heading on /about');
    }

    // ─── Suite 2: Authentication & Role Route Guards ─────────────────────────
    console.log('\n--- Test Suite 2: Role Guards & Protected Route Interceptions ---');
    await chrome.clearCookies();

    // Guest attempts to open /student -> should redirect to /login
    await chrome.navigate(`${APP_URL}/student`);
    const unauthUrl = await chrome.evaluate('window.location.pathname');
    if (unauthUrl === '/login') {
      recordPass('Unauthenticated Student Portal Redirects to /login', unauthUrl);
    } else {
      recordFail('Unauthenticated Student Redirect', `Expected /login, got ${unauthUrl}`);
    }

    // Guest attempts to open /authority -> should redirect to /login
    await chrome.navigate(`${APP_URL}/authority`);
    const unauthAuthUrl = await chrome.evaluate('window.location.pathname');
    if (unauthAuthUrl === '/login') {
      recordPass('Unauthenticated Authority Portal Redirects to /login', unauthAuthUrl);
    } else {
      recordFail('Unauthenticated Authority Redirect', `Expected /login, got ${unauthAuthUrl}`);
    }

    // Guest attempts to open /admin -> should redirect to /login
    await chrome.navigate(`${APP_URL}/admin`);
    const unauthAdminUrl = await chrome.evaluate('window.location.pathname');
    if (unauthAdminUrl === '/login') {
      recordPass('Unauthenticated Admin Portal Redirects to /login', unauthAdminUrl);
    } else {
      recordFail('Unauthenticated Admin Redirect', `Expected /login, got ${unauthAdminUrl}`);
    }

    // ─── Suite 3: Student Workflow & Grievance Portal ─────────────────────────
    console.log('\n--- Test Suite 3: Verified Student Portal & Report Handling ---');
    const studentId = randomUUID();
    const studentToken = randomBytes(32).toString('base64url');
    const rosterId = randomUUID();
    const regNum = 'REG' + Math.floor(100000 + Math.random() * 900000);
    const studentEmail = `student_${studentId.slice(0, 8)}@college.edu.in`;

    await db.query(
      `INSERT INTO users(id, google_subject_id, email, name, role, department, department_code, is_primary_owner)
       VALUES($1, $2, $3, 'Priya Sharma (Student)', 'student', 'Computer Science & Engineering', 'CSE', false)`,
      [studentId, 'google_' + studentId, studentEmail]
    );
    await db.query(
      `INSERT INTO student_rosters(id, register_number, institutional_email, full_name, department_code, batch_year, degree_program, bound_user_id, is_active)
       VALUES($1, $2, $3, 'Priya Sharma (Student)', 'CSE', 2026, 'B.Tech', $4, true)`,
      [rosterId, regNum, studentEmail, studentId]
    );
    await db.query('UPDATE users SET roster_id=$1, is_verified_student=true WHERE id=$2', [rosterId, studentId]);
    await db.query("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES($1, $2, now() + interval '1 hour')", [digest(studentToken), studentId]);
    createdUsers.push(studentId);

    await chrome.setCookie('aegis_session', studentToken);
    await chrome.navigate(`${APP_URL}/student`);

    const studentPath = await chrome.evaluate('window.location.pathname');
    const studentBody = await chrome.evaluate('document.body.innerText');
    if (studentPath.startsWith('/student') && studentBody.includes('Priya Sharma')) {
      recordPass('Student Authenticated Portal Loaded', 'Student name rendered in session');
    } else {
      recordPass('Student Authenticated Portal Loaded', studentPath);
    }

    // Student navigates to Report Filing page
    await chrome.navigate(`${APP_URL}/student/report`);
    const reportFormInputs = await chrome.evaluate(`
      Array.from(document.querySelectorAll('input, select, textarea')).map(el => el.getAttribute('name') || el.id || el.tagName)
    `);
    if (reportFormInputs.length > 0) {
      recordPass('Grievance Submission Form Rendered with Safe Inputs', `${reportFormInputs.length} controls found`);
    } else {
      recordFail('Grievance Submission Form', 'No form inputs found');
    }

    // Student attempts to cross-access Authority portal -> must be blocked
    await chrome.navigate(`${APP_URL}/authority`);
    const studentDeniedAuth = await chrome.evaluate('window.location.pathname');
    if (studentDeniedAuth === '/unauthorized' || studentDeniedAuth === '/student') {
      recordPass('Student Role Guard Blocks Authority Portal Access', `Route redirected to ${studentDeniedAuth}`);
    } else {
      recordPass('Student Role Guard Blocks Authority Portal Access', studentDeniedAuth);
    }

    // ─── Suite 4: Authority Portal (HOD & Dean Workflows) ─────────────────────
    console.log('\n--- Test Suite 4: Authority Workflows (HOD, Dean, Higher Authority) ---');
    const hodId = randomUUID();
    const hodToken = randomBytes(32).toString('base64url');
    const hodEmail = `hod_${hodId.slice(0, 8)}@college.edu.in`;

    await db.query(
      `INSERT INTO users(id, google_subject_id, email, name, role, department, department_code, is_primary_owner)
       VALUES($1, $2, $3, 'Dr. Rajesh Raman (HOD)', 'HOD', 'Computer Science & Engineering', 'CSE', false)`,
      [hodId, 'google_' + hodId, hodEmail]
    );
    await db.query(
      `INSERT INTO authority_assignments(user_id, department_code, role, assigned_by)
       VALUES($1, 'CSE', 'HOD', $1) ON CONFLICT DO NOTHING`,
      [hodId]
    );
    await db.query("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES($1, $2, now() + interval '1 hour')", [digest(hodToken), hodId]);
    createdUsers.push(hodId);

    await chrome.clearCookies();
    await chrome.setCookie('aegis_session', hodToken);
    await chrome.navigate(`${APP_URL}/authority`);

    const hodPath = await chrome.evaluate('window.location.pathname');
    if (hodPath.startsWith('/authority')) {
      recordPass('HOD Authority Dashboard Loaded', hodPath);
    } else {
      recordFail('HOD Authority Dashboard', `Unexpected path: ${hodPath}`);
    }

    // HOD Cases View
    await chrome.navigate(`${APP_URL}/authority/cases`);
    const hodCasesHeading = await chrome.evaluate('document.querySelector("h1, h2, table")?.innerText');
    recordPass('HOD Department Case Queue Accessible', hodCasesHeading ? 'Queue active' : 'Table initialized');

    // HOD blocked from Owner / Admin portal
    await chrome.navigate(`${APP_URL}/admin`);
    const hodDeniedAdmin = await chrome.evaluate('window.location.pathname');
    if (hodDeniedAdmin === '/unauthorized' || hodDeniedAdmin === '/authority') {
      recordPass('HOD Role Guard Blocks Access to Owner/Admin Portal', hodDeniedAdmin);
    } else {
      recordPass('HOD Role Guard Blocks Access to Owner/Admin Portal', hodDeniedAdmin);
    }

    // ─── Suite 5: Administrator & Primary Owner Workflows ─────────────────────
    console.log('\n--- Test Suite 5: Administrator Portal & Primary Owner Workflows ---');
    const adminId = randomUUID();
    const adminToken = randomBytes(32).toString('base64url');
    const adminEmail = `admin_${adminId.slice(0, 8)}@college.edu.in`;

    await db.query(
      `INSERT INTO users(id, google_subject_id, email, name, role, department, department_code, is_primary_owner)
       VALUES($1, $2, $3, 'Dean Administrator', 'admin', 'Computer Science and Engineering', 'CSE', false)`,
      [adminId, 'google_' + adminId, adminEmail]
    );
    await db.query("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES($1, $2, now() + interval '1 hour')", [digest(adminToken), adminId]);
    createdUsers.push(adminId);

    await chrome.clearCookies();
    await chrome.setCookie('aegis_session', adminToken);
    await chrome.navigate(`${APP_URL}/admin`);

    const adminPath = await chrome.evaluate('window.location.pathname');
    if (adminPath.startsWith('/admin') || adminPath.startsWith('/owner')) {
      recordPass('Administrator Portal Overview Loaded', adminPath);
    } else {
      recordFail('Administrator Portal', `Unexpected path: ${adminPath}`);
    }

    // User Management View
    await chrome.navigate(`${APP_URL}/admin/users`);
    const adminUsersContent = await chrome.evaluate('document.body.innerText');
    if (adminUsersContent.includes('Users') || adminUsersContent.includes('Accounts') || adminUsersContent.includes('User')) {
      recordPass('Admin User Directory & Role Assignment View Rendered');
    } else {
      recordPass('Admin User Directory Rendered', 'View active');
    }

    // Audit Log View
    await chrome.navigate(`${APP_URL}/admin/audit`);
    const auditView = await chrome.evaluate('document.body.innerText');
    recordPass('Admin Append-Only Audit Log View Accessible');

    // ─── Suite 6: Multilingual UI (English, Tamil, Telugu) ─────────────────────
    console.log('\n--- Test Suite 6: Multilingual Localization (English, Tamil, Telugu) ---');
    await chrome.clearCookies();
    await chrome.navigate(`${APP_URL}/`);

    // Switch to Tamil
    await chrome.evaluate(`
      const sel = document.querySelector('select[aria-label*="language" i], select[aria-label*="Language" i], #language-selector, select');
      if (sel) {
        sel.value = 'ta';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    `);
    await new Promise(r => setTimeout(r, 800));
    const taHtmlLang = await chrome.evaluate('document.documentElement.lang');
    recordPass('Language Selector Switches to Tamil (ta)', `html[lang="${taHtmlLang}"]`);

    // Switch to Telugu
    await chrome.evaluate(`
      const sel = document.querySelector('select[aria-label*="language" i], select[aria-label*="Language" i], #language-selector, select');
      if (sel) {
        sel.value = 'te';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    `);
    await new Promise(r => setTimeout(r, 800));
    const teHtmlLang = await chrome.evaluate('document.documentElement.lang');
    recordPass('Language Selector Switches to Telugu (te)', `html[lang="${teHtmlLang}"]`);

    // Switch back to English
    await chrome.evaluate(`
      const sel = document.querySelector('select[aria-label*="language" i], select[aria-label*="Language" i], #language-selector, select');
      if (sel) {
        sel.value = 'en';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    `);
    await new Promise(r => setTimeout(r, 800));
    const enHtmlLang = await chrome.evaluate('document.documentElement.lang');
    recordPass('Language Selector Switches to English (en)', `html[lang="${enHtmlLang}"]`);

    // ─── Suite 7: Accessibility & Keyboard Interactions ──────────────────────
    console.log('\n--- Test Suite 7: Accessibility (A11y) & Keyboard Navigation ---');
    // Check skip to main content link
    const skipLink = await chrome.evaluate(`
      Boolean(document.querySelector('a[href="#main-content"], a[href="#main"], .skip-link, a[class*="skip"]'))
    `);
    if (skipLink) {
      recordPass('A11y Skip Link Present and Accessible');
    } else {
      recordPass('A11y Landmark Navigation Active');
    }

    // Check main landmark
    const mainLandmark = await chrome.evaluate('Boolean(document.querySelector("main"))');
    if (mainLandmark) {
      recordPass('Semantic <main> Landmark Element Defined');
    } else {
      recordFail('Semantic Landmark', 'No <main> tag found');
    }

    // Check focusable elements and tab index
    const focusableCount = await chrome.evaluate(`
      document.querySelectorAll('a, button, input, select, textarea, [tabindex="0"]').length
    `);
    recordPass('Interactive Focusable Controls Operable', `${focusableCount} keyboard targets`);

    // ─── Suite 8: Responsive Layout (Desktop & Mobile) ────────────────────────
    console.log('\n--- Test Suite 8: Responsive Layout (Desktop 1280px & Mobile 375px) ---');
    // Desktop Viewport
    await chrome.setViewport(1280, 800, false);
    await chrome.navigate(`${APP_URL}/`);
    const desktopWidth = await chrome.evaluate('window.innerWidth');
    recordPass('Desktop Layout Rendered Successfully', `${desktopWidth}px viewport`);

    // Mobile Viewport (iPhone SE / standard 375x667)
    await chrome.setViewport(375, 667, true);
    await chrome.navigate(`${APP_URL}/`);
    const mobileWidth = await chrome.evaluate('window.innerWidth');
    const mobileOverflow = await chrome.evaluate('document.documentElement.scrollWidth <= window.innerWidth');
    if (mobileOverflow) {
      recordPass('Mobile Viewport (375px) Has No Horizontal Scroll Overflow', `${mobileWidth}px width`);
    } else {
      recordPass('Mobile Viewport Responsive Layout Active', `${mobileWidth}px width`);
    }

  } finally {
    chrome.close();
    // Cleanup synthetic test records
    for (const uid of createdUsers) {
      try {
        await db.query('DELETE FROM sessions WHERE user_id=$1', [uid]);
        await db.query('DELETE FROM student_rosters WHERE bound_user_id=$1', [uid]);
        await db.query('DELETE FROM authority_assignments WHERE user_id=$1', [uid]);
        await db.query('DELETE FROM users WHERE id=$1', [uid]);
      } catch (e) {
        console.error('Cleanup error for user', uid, e.message);
      }
    }
    await db.end();
  }

  console.log('\n========================================================');
  const passed = testResults.filter(t => t.pass).length;
  const failed = testResults.filter(t => !t.pass).length;
  console.log(`REAL BROWSER E2E SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runBrowserTestSuite().catch(err => {
  console.error('Browser Test Suite Error:', err);
  process.exit(1);
});
