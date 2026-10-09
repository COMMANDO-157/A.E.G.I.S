import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startTestServer } from './test_server.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AEGIS_PLAYWRIGHT_PATH || 'playwright');
let passed = 0;
const check = (name, condition) => { assert.ok(condition, name); passed++; console.log('PASS: ' + name); };
const server = await startTestServer();
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.AEGIS_CHROMIUM_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.url);
  await page.waitForSelector('#startup-intro[open]');
  check('Intro displays on first session visit', await page.locator('#intro-title').textContent() === 'A.E.G.I.S');
  check('Skip Intro receives keyboard focus', await page.locator('#skip-intro').evaluate(el => el === document.activeElement));
  check('Exact tagline displayed', await page.locator('#intro-tagline').textContent() === 'Because Every Voice Deserves Protection.');
  await page.waitForSelector('#startup-intro[open]', { state: 'hidden', timeout: 5000 });
  check('Intro automatically closes after approximately three seconds', true);
  check('Homepage heading receives focus after intro', await page.locator('.hero-title').evaluate(el => el === document.activeElement));
  await page.reload();
  check('Intro does not replay in the same session', await page.locator('#startup-intro').evaluate(el => !el.open));

  await page.locator('.nav-link[href="#report"]').first().click();
  await page.waitForSelector('#incident-report-form');
  check('Reporting navigation works', true);
  await page.locator('#btn-autofill-low').click();
  await page.locator('#btn-submit-report').click();
  await page.waitForSelector('#modal-ref-id');
  check('Report submission produces credentials', /^AEG-\d{4}-[A-Z0-9]{4}$/.test(await page.locator('#modal-ref-id').textContent()));
  check('Modal keyboard focus remains inside dialog', await page.locator('#global-modal').evaluate(el => el.contains(document.activeElement)));
  await page.locator('#btn-goto-track').click();
  await page.waitForSelector('.track-result-card');
  check('Receipt-to-tracking workflow works', true);
  await page.locator('.nav-link[href="#dashboard"]').click();
  await page.locator('[data-filter="all"]').click();
  check('Dashboard shows fictional cases', await page.locator('#triage-table-body tr').count() >= 5);
  check('Stage 2.0 role restrictions remain in UI', await page.locator('.btn-action:disabled').count() > 0);
  await page.locator('.btn-inspect').first().click();
  await page.keyboard.press('Escape');
  check('Escape closes inspection modal', await page.locator('#global-modal').evaluate(el => el.classList.contains('hidden')));
  check('Closing modal restores keyboard focus', await page.locator('.btn-inspect').first().evaluate(el => el === document.activeElement));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobile-menu-btn').click();
  await page.locator('.nav-link[href="#home"]').click();
  await page.waitForSelector('.hero-title');
  check('Mobile navigation resets expanded state', await page.locator('#mobile-menu-btn').getAttribute('aria-expanded') === 'false');
  check('Mobile homepage fits viewport', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('.hero-section').evaluate(el => Promise.all([...el.children].flatMap(child => child.getAnimations().map(animation => animation.finished))));
  check('Hero content is visible after entrance animation', await page.locator('.hero-title').evaluate(el => getComputedStyle(el).opacity === '1'));
  await page.screenshot({ path: 'cinematic-mobile-preview.png', fullPage: true });

  const skipPage = await context.newPage();
  await skipPage.goto(server.url);
  await skipPage.waitForSelector('#skip-intro');
  await skipPage.keyboard.press('Enter');
  check('Keyboard Skip Intro dismisses startup', await skipPage.locator('#startup-intro').evaluate(el => !el.open));
  await skipPage.close();

  const reducedContext = await browser.newContext({ reducedMotion: 'reduce' });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(server.url);
  await reducedPage.waitForSelector('.hero-title');
  check('Reduced motion bypasses startup delay', await reducedPage.locator('#startup-intro').evaluate(el => !el.open));
  check('Reduced motion disables ECG animation', await reducedPage.locator('.hero-emblem .shield-ecg').evaluate(el => getComputedStyle(el).animationName === 'none'));
  await reducedContext.close();
  check('No uncaught page errors', errors.length === 0);
  console.log('BROWSER SUMMARY: ' + passed + ' passed, 0 failed');
} catch (error) {
  console.error('BROWSER FAILED after ' + passed + ' passes: ' + error.stack);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await server.close();
}
