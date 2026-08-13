import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  args: process.env.CHROMIUM_EXECUTABLE_PATH ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] : [],
});
const pages = [
  ['index.html', 'h1'],
  ['salary-calculator.html', '#basicSalary'],
  ['offer-comparison-calculator.html', '#compareButton'],
  ['job-switch-worth-it-calculator.html', '#calculateButton, button[onclick*="calculate"]'],
];
const failures = [];

for (const [viewportName, viewport] of Object.entries({ desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844 } })) {
  const context = await browser.newContext({ viewport });
  for (const [file, marker] of pages) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    try {
      await page.goto(pathToFileURL(resolve(root, file)).href, { waitUntil: 'load' });
      assert.ok(await page.title(), `${file} has no title`);
      assert.equal(await page.locator(marker).count() > 0, true, `${file} is missing ${marker}`);
      assert.deepEqual(errors, [], `${file} console errors: ${errors.join(' | ')}`);
      console.log(`PASS ${viewportName} ${file}: loaded, marker present, console clear`);
    } catch (error) {
      failures.push(`${viewportName} ${file}: ${error.stack || error.message}`);
    }
    await page.close();
  }
  await context.close();
}

await browser.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
