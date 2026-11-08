import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDirectory = process.env.STAGE5_EVIDENCE_DIR || '/tmp/stage5-evidence';
const baseURL = process.env.ANNUAL_LEAVE_TEST_URL || 'http://127.0.0.1:4173/annual-leave-calculator.html';

await mkdir(evidenceDirectory, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  args: process.env.CHROMIUM_EXECUTABLE_PATH ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] : [],
});
const failures = [];

async function fillReadyScenario(page) {
  await page.locator('#hireDate').fill('2026-01-01');
  await page.locator('#calculationDate').fill('2026-12-31');
  await page.locator('#leaveYearType').selectOption('calendar');
  await page.locator('#leaveYearReference').fill('2026-06-01');
  await page.locator('#contractAnnualDays').fill('14');
  await page.locator('#contractProrationPolicy').selectOption('completed-months');
  await page.locator('#contractEligibilityPolicy').selectOption('after-three-months');
  await page.locator('#usedDays').fill('4');
  await page.locator('#carriedDays').fill('2');
  await page.locator('#adjustmentDays').fill('-1');
}

async function runViewport(name, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(error.message));
  await page.goto(baseURL, { waitUntil: 'networkidle' });

  assert.equal(await page.title(), 'Annual Leave Calculator Singapore – Pro-Rated Entitlement');
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://sg-salary-calculator.vercel.app/annual-leave-calculator.html');
  assert.equal(await page.locator('#leaveForm').evaluate(element => element.tagName), 'FORM');
  assert.equal(await page.locator('#leaveYearType').inputValue(), '', 'leave year must not have a default');
  assert.equal(await page.locator('#contractProrationPolicy').inputValue(), '', 'company policy must not have a default');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${name} has horizontal overflow`);

  await page.getByRole('button', { name: 'Calculate Annual Leave' }).click();
  assert.match(await page.locator('#errorBox').innerText(), /Employment start date is required/);
  assert.equal(await page.locator('#resultBox').isHidden(), true);

  await page.locator('#hireDate').fill('2026-01-01');
  await page.locator('#calculationDate').fill('2026-12-31');
  await page.getByRole('button', { name: 'Calculate Annual Leave' }).click();
  assert.match(await page.locator('#errorBox').innerText(), /Choose Calendar year, Employment anniversary year, or Custom company leave year/);

  await fillReadyScenario(page);
  await page.getByRole('button', { name: 'Calculate Annual Leave' }).click();
  assert.equal(await page.locator('#resultStatus').innerText(), 'Ready');
  assert.equal(await page.locator('#statRaw').innerText(), '7.00 days');
  assert.equal(await page.locator('#statBalance').innerText(), '3 days');
  assert.equal(await page.locator('#contractBalance').innerText(), '11 days');
  assert.match(await page.locator('#inputSummary').innerText(), /1 Jan 2026 to 31 Dec 2026/);
  await page.screenshot({ path: resolve(evidenceDirectory, `annual-leave-${name}-result.png`), fullPage: true });

  await page.locator('#contractProrationPolicy').selectOption('');
  await page.getByRole('button', { name: 'Calculate Annual Leave' }).click();
  assert.equal(await page.locator('#resultStatus').innerText(), 'Manual review required');
  assert.equal(await page.locator('#statBalance').innerText(), '3 days');
  assert.match(await page.locator('#contractBalance').innerText(), /Not included/);
  await page.locator('#contractProrationPolicy').selectOption('completed-months');

  const firstRow = page.locator('.range-row').first();
  await firstRow.locator('.range-start').fill('2026-01-01');
  await firstRow.locator('.range-end').fill('2026-01-10');
  await page.getByRole('button', { name: 'Add unpaid-leave period' }).click();
  const secondRow = page.locator('.range-row').nth(1);
  await secondRow.locator('.range-start').fill('2026-01-05');
  await secondRow.locator('.range-end').fill('2026-01-20');
  await page.getByRole('button', { name: 'Add unpaid-leave period' }).click();
  const thirdRow = page.locator('.range-row').nth(2);
  await thirdRow.locator('.range-start').fill('2026-01-21');
  await thirdRow.locator('.range-end').fill('2026-01-31');
  await page.getByRole('button', { name: 'Calculate Annual Leave' }).click();
  assert.equal(await page.locator('#resultStatus').innerText(), 'Ready');
  assert.match(await page.locator('#unpaidSummary').innerText(), /31 unique dated unpaid-leave day\(s\); 1 complete service month\(s\) automatically excluded/);
  assert.equal(await page.locator('#statBalance').innerText(), '2 days');
  assert.equal(await page.locator('#contractBalance').innerText(), '10 days');

  await firstRow.locator('.range-start').fill('2026-03-10');
  await firstRow.locator('.range-end').fill('2026-03-12');
  await secondRow.locator('.range-start').fill('');
  await secondRow.locator('.range-end').fill('');
  await thirdRow.locator('.range-start').fill('');
  await thirdRow.locator('.range-end').fill('');
  await page.getByRole('button', { name: 'Calculate Annual Leave' }).click();
  assert.equal(await page.locator('#resultStatus').innerText(), 'Manual review required');
  assert.match(await page.locator('#pendingBox').innerText(), /MANUAL_REVIEW_REQUIRED/);
  assert.match(await page.locator('#statBalance').innerText(), /Not included/);
  assert.match(await page.locator('#contractBalance').innerText(), /Not included/);

  await firstRow.locator('.range-start').fill('');
  await firstRow.locator('.range-end').fill('');
  await page.locator('#usedDays').fill('-1');
  await page.getByRole('button', { name: 'Calculate Annual Leave' }).click();
  assert.match(await page.locator('#errorBox').innerText(), /cannot be negative/);
  assert.equal(await page.locator('#resultBox').isHidden(), true);

  await page.locator('#hireDate').focus();
  let focusedId = 'hireDate';
  for (let step = 0; step < 5 && focusedId !== 'calculationDate'; step += 1) {
    await page.keyboard.press('Tab');
    focusedId = await page.evaluate(() => document.activeElement && document.activeElement.id);
  }
  assert.equal(focusedId, 'calculationDate');
  const unlabeled = await page.locator('input, select, textarea').evaluateAll(controls => controls.filter(control => {
    if (control.type === 'hidden' || control.disabled) return false;
    return !control.labels || control.labels.length === 0;
  }).map(control => control.id || control.className));
  assert.deepEqual(unlabeled, []);
  assert.equal(await page.locator('a[target="_blank"][href="https://www.mom.gov.sg/employment-practices/leave/annual-leave/eligibility-and-entitlement"]').first().getAttribute('rel'), 'noopener');
  assert.equal(await page.locator('a[href="/resignation-calculator.html"]').count() >= 2, true);

  await page.getByRole('button', { name: 'Reset' }).click();
  assert.equal(await page.locator('#leaveYearType').inputValue(), '');
  assert.equal(await page.locator('#resultBox').isHidden(), true);
  assert.deepEqual(consoleErrors, [], `${name} console errors: ${consoleErrors.join(' | ')}`);
  await page.screenshot({ path: resolve(evidenceDirectory, `annual-leave-${name}.png`), fullPage: true });
  await context.close();
}

for (const [name, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } })) {
  try {
    await runViewport(name, viewport);
    console.log(`PASS ${name}: calculations, manual-review gate, labels, keyboard, overflow, reset and console`);
  } catch (error) {
    failures.push(`${name}: ${error.stack || error.message}`);
  }
}

await browser.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Evidence: ${evidenceDirectory}`);
}
