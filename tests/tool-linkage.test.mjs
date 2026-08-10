import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [resignation, annualLeave] = await Promise.all([
  readFile(join(root, 'resignation-calculator.html'), 'utf8'),
  readFile(join(root, 'annual-leave-calculator.html'), 'utf8'),
]);

test('the calculators link directly to each other without query or fragment data', () => {
  assert.match(resignation, /href="\/annual-leave-calculator\.html"/);
  assert.match(annualLeave, /href="\/resignation-calculator\.html"/);
  assert.doesNotMatch(resignation, /annual-leave-calculator\.html[?#][^"']+/i);
  assert.doesNotMatch(annualLeave, /resignation-calculator\.html[?#][^"']+/i);
  for (const page of [resignation, annualLeave]) {
    assert.doesNotMatch(page, /(?:URLSearchParams|searchParams|getQueryParam|location\.search)/);
  }
});

test('each calculator owns one non-overlapping employment task', () => {
  assert.match(resignation, /does not recalculate entitlement/i);
  assert.match(resignation, /HR-confirmed cash-eligible or notice-offset days/i);
  assert.match(annualLeave, /calculates entitlement and balance only/i);
  assert.match(annualLeave, /does not calculate cash value/i);
  assert.match(annualLeave, /does not calculate notice pay, final salary or settlement totals/i);

  for (const id of ['leaveYearType', 'usedDays', 'carriedDays', 'adjustmentDays', 'unpaidRanges']) {
    assert.ok(annualLeave.includes(`id="${id}"`), `Annual Leave must own #${id}`);
    assert.ok(!resignation.includes(`id="${id}"`), `Resignation must not own #${id}`);
  }
  for (const id of ['noticeLength', 'finalMonthWorkDays', 'cashEligibleLeaveDays', 'offsetLeaveDays']) {
    assert.ok(resignation.includes(`id="${id}"`), `Resignation must own #${id}`);
    assert.ok(!annualLeave.includes(`id="${id}"`), `Annual Leave must not own #${id}`);
  }
});

test('shared concepts use one rule module and the approved URL set stays frozen', async () => {
  for (const page of [resignation, annualLeave]) {
    assert.match(page, /<script src="employment-rules\.js"><\/script>/);
    assert.match(page, /Independent educational estimate only/);
    assert.match(page, /not endorsed or certified by MOM, CPF Board or any government agency/i);
    assert.match(page, /manual review/i);
  }

  const files = await readdir(root);
  for (const forbidden of [
    'leave-encashment-calculator.html',
    'notice-period-calculator.html',
    'pro-rated-annual-leave-calculator.html',
    'foreigner-income-tax-calculator.html',
  ]) assert.ok(!files.includes(forbidden), `${forbidden} must remain absent`);
});

test('terminology, source IDs, review dates and disclaimers stay aligned', () => {
  for (const page of [resignation, annualLeave]) {
    assert.match(page, /\[MOM-LEAVE-1\]/);
    assert.match(page, /Last reviewed: 10 August 2026/);
    assert.match(page, /statutory/i);
    assert.match(page, /company(?:-| )contract/i);
    assert.match(page, /HR-confirmed/i);
  }
});

test('all seven stage 6 user paths have a determinate destination or review state', () => {
  const paths = [
    { name: 'current leave balance', page: annualLeave, markers: [/Statutory estimate balance/, /Contract estimate balance/] },
    { name: 'prepare resignation notice', page: resignation, markers: [/Contractual Notice Length/, /Contractual notice end/] },
    { name: 'resignation leave encashment', page: resignation, markers: [/HR-confirmed Cash-eligible Leave Days/, /Leave encashment/i] },
    { name: 'unknown leave year', page: annualLeave, markers: [/choose actively/i, /no hidden default/i] },
    { name: 'multiple unpaid periods', page: annualLeave, markers: [/Add unpaid-leave period/, /multiple dated unpaid-leave periods/] },
    { name: 'unknown last attendance', page: resignation, markers: [/Actual Last Scheduled Attendance/, /Not yet confirmed/] },
    { name: 'HR or manual confirmation', page: resignation + annualLeave, markers: [/manual review/i, /confirm them with HR first/i] },
  ];
  for (const path of paths) {
    for (const marker of path.markers) assert.match(path.page, marker, `${path.name} is missing ${marker}`);
  }
});
