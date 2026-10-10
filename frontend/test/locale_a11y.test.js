/**
 * A.E.G.I.S 4.0 — Localization & Accessibility Verification Test Suite
 * WP-4.1.6 & WP-4.1.7 | Comprehensive Locale Coverage & A11y Standards
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../src/locales/en.ts';
import { ta } from '../src/locales/ta.ts';
import { te } from '../src/locales/te.ts';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to recursively collect all dictionary keys as dot-notated paths
function collectLeafKeys(obj, prefix = '') {
  let keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys = keys.concat(collectLeafKeys(v, fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys;
}

// Helper to get nested value by dot path
function getNestedValue(obj, dotPath) {
  return dotPath.split('.').reduce((acc, part) => (acc ? acc[part] : undefined), obj);
}

test('WP-4.1.6: Canonical English Dictionary completeness', () => {
  const enKeys = collectLeafKeys(en);
  assert.ok(enKeys.length > 50, `Expected comprehensive key count in en.ts, got ${enKeys.length}`);

  // Verify mandatory structural categories exist
  assert.ok(en.app && en.app.name === 'A.E.G.I.S');
  assert.ok(en.emergency && en.emergency.police && en.emergency.police.number === '100');
  assert.ok(en.nav && en.nav.home && en.nav.login);
  assert.ok(en.home && en.home.heroTitle);
  assert.ok(en.about && en.about.tiersTitle);
  assert.ok(en.safety && en.safety.helplinesTitle);
  assert.ok(en.common && en.common.signOut);
});

test('WP-4.1.6: Tamil (ta) Dictionary complete coverage (100% key parity with en)', () => {
  const enKeys = collectLeafKeys(en);
  const missingKeys = [];
  const emptyKeys = [];

  for (const keyPath of enKeys) {
    const val = getNestedValue(ta, keyPath);
    if (val === undefined) {
      missingKeys.push(keyPath);
    } else if (typeof val === 'string' && val.trim() === '') {
      emptyKeys.push(keyPath);
    }
  }

  assert.deepEqual(missingKeys, [], `Tamil dictionary has missing keys: ${missingKeys.join(', ')}`);
  assert.deepEqual(emptyKeys, [], `Tamil dictionary has empty values: ${emptyKeys.join(', ')}`);
  assert.strictEqual(ta.app.name, 'A.E.G.I.S');
  assert.strictEqual(ta.emergency.police.number, '100');
  assert.strictEqual(ta.emergency.antiRagging.number, '1800-180-5522');
});

test('WP-4.1.6: Telugu (te) Dictionary complete coverage (100% key parity with en)', () => {
  const enKeys = collectLeafKeys(en);
  const missingKeys = [];
  const emptyKeys = [];

  for (const keyPath of enKeys) {
    const val = getNestedValue(te, keyPath);
    if (val === undefined) {
      missingKeys.push(keyPath);
    } else if (typeof val === 'string' && val.trim() === '') {
      emptyKeys.push(keyPath);
    }
  }

  assert.deepEqual(missingKeys, [], `Telugu dictionary has missing keys: ${missingKeys.join(', ')}`);
  assert.deepEqual(emptyKeys, [], `Telugu dictionary has empty values: ${emptyKeys.join(', ')}`);
  assert.strictEqual(te.app.name, 'A.E.G.I.S');
  assert.strictEqual(te.emergency.police.number, '100');
  assert.strictEqual(te.emergency.antiRagging.number, '1800-180-5522');
});

test('WP-4.1.6: Emergency numbers and contacts are preserved without alteration across all locales', () => {
  for (const [code, dict] of [['ta', ta], ['te', te]]) {
    assert.strictEqual(dict.emergency.police.number, en.emergency.police.number, `${code} police number mismatch`);
    assert.strictEqual(dict.emergency.police.alt, en.emergency.police.alt, `${code} police alt mismatch`);
    assert.strictEqual(dict.emergency.nationalHelpline.number, en.emergency.nationalHelpline.number, `${code} 112 mismatch`);
    assert.strictEqual(dict.emergency.antiRagging.number, en.emergency.antiRagging.number, `${code} antiRagging number mismatch`);
    assert.strictEqual(dict.emergency.antiRagging.email, en.emergency.antiRagging.email, `${code} antiRagging email mismatch`);
    assert.strictEqual(dict.emergency.womenHelpline.number, en.emergency.womenHelpline.number, `${code} womenHelpline mismatch`);
    assert.strictEqual(dict.emergency.mhrd.number, en.emergency.mhrd.number, `${code} mhrd mismatch`);
  }
});

test('WP-4.1.6: Public Claim and Privacy Language Audit (No premature claims of active intake)', () => {
  // Verify intake step 1 disclaimer exists in en
  assert.match(en.home.step1Desc, /disabled|paused|pending verification/i, 'en.home.step1Desc must state intake is disabled/pending');
  assert.match(ta.home.step1Desc, /தற்காலிகமாக நிறுத்தப்பட்டுள்ளது|பாதுகாப்பு சரிபார்ப்பு/, 'ta.home.step1Desc must state intake is paused/pending');
  assert.match(te.home.step1Desc, /నిలిపివేయబడింది|భద్రతా ధృవీకరణ/, 'te.home.step1Desc must state intake is paused/pending');

  // Verify registration step 3 disclaimer
  assert.match(en.register.step3Desc, /disabled|verification is complete/i, 'en.register.step3Desc must advise reporting status');
  assert.match(ta.register.step3Desc, /தற்காலிகமாக நிறுத்தப்பட்டுள்ளது|சரிபார்ப்பு/, 'ta.register.step3Desc must advise reporting status');
  assert.match(te.register.step3Desc, /నిలిపివేయబడింది|ధృవీకరణ/, 'te.register.step3Desc must advise reporting status');
});

test('WP-4.1.6: Accessibility - Skip links and target landmarks exist in layouts', () => {
  const layoutsDir = path.resolve(__dirname, '../src/layouts');
  const layoutFiles = ['PublicLayout.tsx', 'StudentLayout.tsx', 'AuthorityLayout.tsx', 'OwnerLayout.tsx'];

  for (const file of layoutFiles) {
    const content = fs.readFileSync(path.join(layoutsDir, file), 'utf-8');
    assert.ok(content.includes('href="#main-content"'), `${file} must include a skip link targeting #main-content`);
    assert.ok(content.includes('className="skip-link"'), `${file} must use the skip-link CSS class`);
    assert.ok(content.includes('id="main-content"'), `${file} must contain the landmark <main id="main-content"`);
  }
});

test('WP-4.1.6: Accessibility - Focus visible and keyboard styling rules exist in accessibility.css', () => {
  const cssPath = path.resolve(__dirname, '../src/styles/accessibility.css');
  const css = fs.readFileSync(cssPath, 'utf-8');

  assert.ok(css.includes(':focus-visible'), 'accessibility.css must configure :focus-visible');
  assert.ok(css.includes('prefers-reduced-motion: reduce'), 'accessibility.css must provide prefers-reduced-motion reset');
  assert.ok(css.includes('.skip-link'), 'accessibility.css must style .skip-link');
  assert.ok(css.includes('[aria-disabled="true"]'), 'accessibility.css must support aria-disabled');
});

test('WP-4.1.6: Accessibility - LanguageSelector is accessible and keyboard-operable', () => {
  const compPath = path.resolve(__dirname, '../src/components/ui/LanguageSelector.tsx');
  const comp = fs.readFileSync(compPath, 'utf-8');

  assert.ok(comp.includes('aria-label="Display Language"'), 'LanguageSelector select must have aria-label');
  assert.ok(comp.includes('htmlFor="aegis-language-select"'), 'LanguageSelector label must have htmlFor');
  assert.ok(comp.includes('id="aegis-language-select"'), 'LanguageSelector select must have matching id');
});

test('WP-4.1.6 Localization Integration: Zero direct en imports in components and layouts', () => {
  const srcDir = path.resolve(__dirname, '../src');

  function scanDir(dir) {
    let files = [];
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        files = files.concat(scanDir(fullPath));
      } else if (/\.(tsx|ts)$/.test(item.name)) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const allSourceFiles = scanDir(srcDir);
  const offenders = [];

  for (const filePath of allSourceFiles) {
    const relPath = path.relative(srcDir, filePath).replace(/\\/g, '/');
    // LocaleContext.tsx is the sole legitimate consumer of en
    if (relPath === 'context/LocaleContext.tsx') continue;

    const content = fs.readFileSync(filePath, 'utf-8');
    if (/from\s+['"]@\/locales\/en['"]/.test(content)) {
      offenders.push(relPath);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Direct en imports found outside LocaleContext: ${offenders.join(', ')}. All UI components must use useLocale()`
  );
});

test('WP-4.1.6 Localization Integration: useLocale hook integrated across required layouts and pages', () => {
  const requiredFiles = [
    'layouts/PublicLayout.tsx',
    'layouts/StudentLayout.tsx',
    'layouts/AuthorityLayout.tsx',
    'layouts/OwnerLayout.tsx',
    'pages/LandingPage.tsx',
    'pages/AboutPage.tsx',
    'pages/SafetyPage.tsx',
    'pages/LoginPage.tsx',
    'pages/RegisterPage.tsx',
    'pages/NotFoundPage.tsx',
    'pages/SuspendedPage.tsx',
    'pages/student/StudentDashboardPage.tsx',
    'pages/student/StudentReportPage.tsx',
    'pages/student/StudentTrackPage.tsx',
    'pages/authority/AuthorityDashboardPage.tsx',
    'pages/authority/AuthorityCasesPage.tsx',
    'pages/authority/AuthorityReviewPage.tsx',
    'pages/admin/AdminOverviewPage.tsx',
    'pages/admin/AdminUsersPage.tsx',
    'pages/admin/AdminCasesPage.tsx',
    'pages/admin/AdminAuditPage.tsx',
    'components/auth/AuthScreens.tsx',
  ];

  const srcDir = path.resolve(__dirname, '../src');

  for (const relPath of requiredFiles) {
    const fullPath = path.join(srcDir, relPath);
    assert.ok(fs.existsSync(fullPath), `File must exist: ${relPath}`);
    const content = fs.readFileSync(fullPath, 'utf-8');
    assert.ok(
      content.includes('useLocale'),
      `${relPath} must import and invoke useLocale()`
    );
  }
});
