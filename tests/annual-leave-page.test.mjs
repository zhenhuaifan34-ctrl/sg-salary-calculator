import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'annual-leave-calculator.html'), 'utf8');

test('annual leave page owns one canonical application identity', () => {
  assert.match(html, /<title>Annual Leave Calculator Singapore – Pro-Rated Entitlement<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/sg-salary-calculator\.vercel\.app\/annual-leave-calculator\.html">/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /"@type":"WebApplication"/);
  assert.doesNotMatch(html, /government certified|government approved|Verification Ref: SG-MOM/i);
});

test('leave year and company policies have visible blank choices with no hidden default', () => {
  assert.match(html, /id="leaveYearType"><option value="" selected>Choose a leave year/);
  assert.match(html, /id="contractProrationPolicy"><option value="" selected>Choose confirmed policy/);
  assert.match(html, /id="contractEligibilityPolicy"><option value="" selected>Choose confirmed policy/);
  assert.doesNotMatch(html, /leaveYearType['"]?\s*\.value\s*=/);
});

test('statutory and contract tracks are separate and manual review is excluded', () => {
  assert.match(html, /MOM statutory minimum estimate/);
  assert.match(html, /Company contract estimate/);
  assert.match(html, /Not included — manual review/);
  assert.match(html, /Excluded pending items/);
  assert.match(html, /MANUAL_REVIEW_REQUIRED/);
});

test('the page delegates calculations to the shared rule module', () => {
  assert.match(html, /<script src="employment-rules\.js"><\/script>/);
  assert.match(html, /EmploymentRules\.calculateAnnualLeave\(input\(\)\)/);
  assert.doesNotMatch(html, /type="module"|fetch\(|https:\/\/cdn\./i);
  const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .filter(match => !/application\/ld\+json/.test(match[0]))
    .map(match => match[1]);
  inlineScripts.forEach(source => assert.doesNotThrow(() => new Function(source)));
});

test('unpaid leave controls, ledger details and resignation boundary are visible', () => {
  for (const marker of ['id="unpaidRanges"', 'id="unpaidTotalDays"', 'id="usedDays"', 'id="carriedDays"', 'id="adjustmentDays"']) assert.ok(html.includes(marker));
  assert.match(html, /href="\/resignation-calculator\.html"/);
  assert.match(html, /does not calculate notice pay, final salary or settlement totals/i);
  assert.doesNotMatch(html, /id="(?:monthlyGross|noticeLength|finalMonthWorkDays|noticePay)"/);
});

test('official source, independent disclaimer, metadata and responsive contracts are present', () => {
  assert.match(html, /mom\.gov\.sg\/employment-practices\/leave\/annual-leave\/eligibility-and-entitlement/);
  assert.match(html, /not endorsed or certified by MOM, CPF Board or any government agency/i);
  assert.match(html, /Last reviewed: 10 August 2026/);
  assert.match(html, /@media\(max-width:900px\)/);
  assert.match(html, /@media\(max-width:560px\)/);
});

test('only the approved calculator URL exists in stage 5', async () => {
  const files = await readdir(root);
  assert.ok(files.includes('annual-leave-calculator.html'));
  for (const forbidden of ['leave-encashment-calculator.html', 'notice-period-calculator.html', 'pro-rated-annual-leave-calculator.html', 'foreigner-income-tax-calculator.html']) {
    assert.ok(!files.includes(forbidden));
  }
});

test('stage 6 hands exit settlement to Resignation without URL data transfer', () => {
  assert.match(html, /Use Annual Leave for the leave-year ledger/);
  assert.match(html, /Use Resignation for the exit settlement/);
  assert.match(html, /calculates entitlement and balance only/i);
  assert.match(html, /does not calculate cash value/i);
  assert.match(html, /does not calculate notice pay, final salary or settlement totals/i);
  assert.match(html, /transfers no employment dates, salary, leave balance or other form input/i);
  assert.doesNotMatch(html, /resignation-calculator\.html[?#][^"']+/i);
});
