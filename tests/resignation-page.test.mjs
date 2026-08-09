import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'resignation-calculator.html'), 'utf8');

test('original URL, canonical and SEO application identity remain intact', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/sg-salary-calculator\.vercel\.app\/resignation-calculator\.html">/);
  assert.match(html, /<title>Singapore Resignation Calculator 2026/);
  assert.match(html, /"@type":"SoftwareApplication"/);
  assert.doesNotMatch(html, /government certified|government approved|Verification Ref: SG-MOM/i);
});

test('page contains every stage 3 workflow and result boundary', () => {
  const requiredIds = [
    'resignationDate', 'noticeLength', 'noticeUnit', 'dayBasis', 'workingEffectiveDate',
    'includedWorkingDates', 'fulfilment', 'earlyTerminationInitiator', 'servedThroughDate',
    'payableUnservedWorkDays', 'finalSalaryTreatment', 'finalMonthWorkDays',
    'finalMonthPayableDays', 'leaveTreatment', 'cashEligibleLeaveDays', 'offsetLeaveDays',
    'offsetConsent', 'offsetOfficialEndDate', 'attendanceStatus', 'confirmedAttendanceDate',
    'cpfTreatment', 'resContractualEnd', 'resOfficialLastDay', 'resAttendanceDate',
    'employerItems', 'employeeItems', 'pendingBox', 'totalGate', 'cpfLines', 'formulaList',
  ];
  for (const id of requiredIds) assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  assert.match(html, /Employer payable items/);
  assert.match(html, /Employee possible payable items/);
  assert.match(html, /no automatic netting/i);
});

test('page uses the shared frozen rule implementation without legal-date ISO conversion', () => {
  assert.match(html, /<script src="employment-rules\.js"><\/script>/);
  assert.match(html, /EmploymentRules\.calculateSettlement/);
  assert.doesNotMatch(html, /toISOString\(\)/);
});

test('sources and independent disclaimer are present', () => {
  assert.match(html, /mom\.gov\.sg\/employment-practices\/termination-of-employment\/termination-with-notice/);
  assert.match(html, /mom\.gov\.sg\/employment-practices\/salary\/monthly-and-daily-salary/);
  assert.match(html, /cpf\.gov\.sg\/service\/article\/are-cpf-contributions-payable-on-compensation-in-lieu-of-notice/);
  assert.match(html, /not endorsed or certified by MOM, CPF Board or any government agency/i);
});

test('no duplicate or excluded calculator page is created', async () => {
  const files = await readdir(root);
  for (const forbidden of [
    'annual-leave-calculator.html', 'foreigner-income-tax-calculator.html',
    'leave-encashment-calculator.html', 'notice-period-calculator.html',
    'pro-rated-annual-leave-calculator.html',
  ]) assert.ok(!files.includes(forbidden), `${forbidden} must remain absent`);
});

test('responsive layout and touch-size rules cover desktop and mobile', () => {
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0">/);
  assert.match(html, /@media\(max-width:920px\)/);
  assert.match(html, /@media\(max-width:640px\)/);
  assert.match(html, /\.tool-hero-layout,\.tool-layout\{grid-template-columns:1fr\}/);
  assert.match(html, /\.form-grid,\.action-stack\{grid-template-columns:1fr\}/);
  assert.match(html, /input,select\{[^}]*min-height:50px/);
});
