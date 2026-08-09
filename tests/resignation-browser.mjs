import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDirectory = resolve(repositoryRoot, '..', 'stage3-evidence');
const baseURL = process.env.RESIGNATION_TEST_URL || 'http://127.0.0.1:4173/resignation-calculator.html';

await mkdir(evidenceDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const failures = [];

async function runViewport(name, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.goto(baseURL, { waitUntil: 'networkidle' });

  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://sg-salary-calculator.vercel.app/resignation-calculator.html');
  assert.equal(await page.locator('#resignPanel').evaluate((element) => element.tagName), 'FORM');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${name} has horizontal overflow`);

  await page.getByRole('button', { name: 'Full 1-month notice' }).click();
  assert.equal(await page.locator('#resultStatus').textContent(), 'Ready');
  assert.match(await page.locator('#resContractualEnd').textContent(), /^2 Sep(?:t)? 2026$/);
  assert.match(await page.locator('#resOfficialLastDay').textContent(), /^2 Sep(?:t)? 2026$/);
  assert.match(await page.locator('#resAttendanceDate').textContent(), /^2 Sep(?:t)? 2026$/);
  assert.match(await page.locator('#employerItems').textContent(), /Final incomplete-month salary/);
  assert.match(await page.locator('#employerItems').textContent(), /Confirmed leave encashment/);

  await page.getByRole('button', { name: 'Employer ends notice early' }).click();
  assert.match(await page.locator('#employerItems').textContent(), /Compensation in lieu of notice/);
  assert.match(await page.locator('#totalLines').textContent(), /S\$2,895\.24/);
  assert.doesNotMatch(await page.locator('#employeeItems').textContent(), /Compensation in lieu of notice/);

  await page.getByRole('button', { name: 'Employee ends notice early' }).click();
  assert.match(await page.locator('#employeeItems').textContent(), /Compensation in lieu of notice/);
  assert.match(await page.locator('#totalLines').textContent(), /S\$1,920\.00/);
  assert.doesNotMatch(await page.locator('#employerItems').textContent(), /Compensation in lieu of notice/);

  await page.locator('#resignationDate').fill('2026-01-31');
  await page.locator('#fulfilment').selectOption('full');
  await page.locator('#attendanceStatus').selectOption('same');
  await page.getByRole('button', { name: 'Calculate Itemised Settlement' }).click();
  assert.equal(await page.locator('#resContractualEnd').textContent(), '28 Feb 2026');

  await page.locator('#resignationDate').fill('2024-02-29');
  await page.getByRole('button', { name: 'Calculate Itemised Settlement' }).click();
  assert.equal(await page.locator('#resContractualEnd').textContent(), '28 Mar 2024');

  await page.locator('#noticeUnit').selectOption('days');
  await page.locator('#noticeLength').fill('30');
  await page.locator('#dayBasis').selectOption('');
  await page.getByRole('button', { name: 'Calculate Itemised Settlement' }).click();
  assert.equal(await page.locator('#resultStatus').textContent(), 'Input blocked');
  assert.match(await page.locator('#errorBox').textContent(), /Calendar or Working/);
  assert.equal(await page.locator('#totalLines').isHidden(), true);

  await page.getByRole('button', { name: 'Full 1-month notice' }).click();
  await page.locator('#leaveTreatment').selectOption('offset');
  await page.locator('#offsetLeaveDays').fill('3');
  await page.locator('#offsetOfficialEndDate').fill('2026-08-28');
  await page.locator('#offsetConsent').check();
  await page.locator('#attendanceStatus').selectOption('same');
  await page.getByRole('button', { name: 'Calculate Itemised Settlement' }).click();
  assert.equal(await page.locator('#resultStatus').textContent(), 'Ready');
  assert.equal(await page.locator('#resOfficialLastDay').textContent(), '28 Aug 2026');
  assert.match(await page.locator('#employerItems').textContent(), /Confirmed leave encashmentS\$0\.00/);

  await page.locator('#resignBasic').fill('-1');
  await page.getByRole('button', { name: 'Calculate Itemised Settlement' }).click();
  assert.equal(await page.locator('#resultStatus').textContent(), 'Input blocked');
  assert.match(await page.locator('#errorBox').textContent(), /greater than zero/);

  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#resignResultBox').isHidden(), true);
  assert.equal(await page.locator('#resignBasic').inputValue(), '');

  const unlabeled = await page.locator('input, select, textarea').evaluateAll((controls) => controls.filter((control) => {
    if (control.type === 'hidden') return false;
    return !control.labels || control.labels.length === 0;
  }).map((control) => control.id));
  assert.deepEqual(unlabeled, []);
  assert.deepEqual(consoleErrors, [], `${name} console errors: ${consoleErrors.join(' | ')}`);
  await page.screenshot({ path: resolve(evidenceDirectory, `resignation-${name}.png`), fullPage: true });
  await context.close();
}

for (const [name, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } })) {
  try {
    await runViewport(name, viewport);
    console.log(`PASS ${name}: scenarios, validation, accessibility labels, overflow and console`);
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
