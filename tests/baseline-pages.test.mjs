import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testsDirectory, '..');
const baselineCommit = '24af17a6130a45aaa93193be1a665d8c4a157f34';

const pages = {
  'salary-calculator.html': {
    sha256: '1ad9c2b96513e5d90468adf1a7d9591e6fc8c8e0da15da6a21342ded16575ade',
    markers: [
      'id="basicSalary"',
      'id="weeklyHours" value="44"',
      'const RATE_MYR=3.32,RATE_CNY=5.35;',
      "const otBase=emp==='non-workman'?Math.min(basic,2600):Math.min(basic,4500)",
      'hourly=(12*otBase)/(52*weekly)',
      'cpfBase=Math.min(gross,8000)',
      "localStorage.getItem('history_salary_list')",
      'function downloadTxtReport()',
    ],
  },
  'resignation-calculator.html': {
    sha256: 'd9f217fb61c3990e0072b9e67790d2c5a6ca3b37f3ad6cb0a410a31336a7e3a6',
    markers: [
      'id="resignBasic"',
      'id="workDaysPerWeek"',
      '<option value="5.5">5.5 Days / Week (Alternate Saturdays)</option>',
      'id="remainingLeave"',
      'id="resignationDate"',
      'id="noticeDays"',
      'const daily=(12*basic)/(52*workDays),cash=daily*leave;',
      'official.setDate(official.getDate()+notice-1);',
      'subtractWorkingDays(official,leave,workDays)',
      "localStorage.getItem('history_resign_list')",
      'function downloadTxtReport()',
    ],
  },
  'offer-comparison-calculator.html': {
    sha256: '5faccf18d4baf8e16b95afb78f927d33d33849906b391b570ad87cd1560bf561',
    markers: [
      'const OW_MONTHLY_CEILING = 8000;',
      'const TOTAL_WAGE_CEILING = 102000;',
      'const WORK_DAYS_PER_WEEK = 5;',
      'const annualCash = annualBaseCash + additionalCash;',
      'const annualOwSubject = Math.min(monthlyOrdinaryCash, OW_MONTHLY_CEILING) * 12;',
      'const cashAfterCpfAndCosts = annualCash - employeeCpf - annualWorkCost;',
      '? (cashAfterCpfAndCosts + benefits) / annualTimeHours',
      'id="compareButton"',
      'function copyResults()',
    ],
  },
  'job-switch-worth-it-calculator.html': {
    sha256: '5ed3a84bdc37b9543ca6b9e2e13d8b23fba31d74f3a51bfe3cd3d0a9cb31644e',
    markers: [
      'const OW_CEILING_2026=8000,AW_CEILING_BASE_2026=102000;',
      'annualValue=annualGrossCash+data.benefits-cpf.employee-annualJobCost',
      'gapLoss=((currentJob.salary+currentJob.allowance)/30)*gapDays',
      'cashScore*.40+hourlyScore*.20+leaveScore*.10',
      'if(netAnnualGain>=8000&&scoreDiff>=8&&breakEven<=6)',
      "const key='sg_job_switch_history_v1'",
      'history.slice(0,5)',
      'function downloadReport()',
    ],
  },
};

const stage2ForbiddenPages = [
  'annual-leave-calculator.html',
  'foreigner-income-tax-calculator.html',
  'leave-encashment-calculator.html',
  'notice-period-calculator.html',
  'pro-rated-annual-leave-calculator.html',
];

async function source(path) {
  return readFile(join(repositoryRoot, path), 'utf8');
}

async function repositoryFiles(directory = repositoryRoot) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries
    .filter((entry) => entry.name !== '.git')
    .map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? repositoryFiles(path) : [relative(repositoryRoot, path)];
    }));
  return paths.flat();
}

test(`unchanged legacy page bytes match main baseline ${baselineCommit}`, async () => {
  for (const [path, contract] of Object.entries(pages)) {
    if (path === 'resignation-calculator.html') continue;
    const bytes = await readFile(join(repositoryRoot, path));
    const digest = createHash('sha256').update(bytes).digest('hex');
    assert.equal(digest, contract.sha256, `${path} changed from the recorded main baseline`);
  }
});

test('unchanged legacy page behavior markers remain present', async () => {
  for (const [path, contract] of Object.entries(pages)) {
    if (path === 'resignation-calculator.html') continue;
    const html = await source(path);
    for (const marker of contract.markers) {
      assert.ok(html.includes(marker), `${path} is missing baseline marker: ${marker}`);
    }
  }
});

test('the test scaffold is not loaded by production HTML', async () => {
  for (const path of Object.keys(pages)) {
    const html = await source(path);
    assert.ok(!html.includes('tests/'), `${path} unexpectedly references the test directory`);
    assert.ok(!html.includes('baseline-pages.test.mjs'), `${path} loads the baseline test`);
  }
});

test('stage 3 deliberately upgrades only the original resignation URL', async () => {
  const html = await source('resignation-calculator.html');
  assert.ok(html.includes('id="resignPanel"'));
  assert.ok(html.includes('<script src="employment-rules.js"></script>'));
  assert.ok(html.includes('Official last employment date'));
  assert.ok(html.includes('Employee possible payable items'));
  assert.ok(html.includes('Excluded pending items'));
  assert.ok(html.includes('https://sg-salary-calculator.vercel.app/resignation-calculator.html'));
});

test('stage 2 does not create later-stage or prohibited tool URLs', async () => {
  const files = await repositoryFiles();
  for (const path of stage2ForbiddenPages) {
    assert.ok(!files.includes(path), `${path} must remain absent in stage 2`);
  }
});

test('formal handoff artifacts are not inside the repository', async () => {
  const files = await repositoryFiles();
  const handoffFiles = files.filter((path) => /SG-Salary-Pro-GitHub-Expansion-Handoff/i.test(path));
  assert.deepEqual(handoffFiles, []);
});
