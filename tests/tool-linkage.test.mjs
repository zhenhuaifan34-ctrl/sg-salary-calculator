import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [resignation, annualLeave] = await Promise.all([
  readFile(join(root, 'resignation-calculator.html'), 'utf8'),
  readFile(join(root, 'annual-leave-calculator.html'), 'utf8'),
]);
const pages = [
  { name: 'Resignation', html: resignation },
  { name: 'Annual Leave', html: annualLeave },
];

function visibleText(html) {
  let visible = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const hiddenElement = /<([a-z][\w:-]*)\b(?=[^>]*(?:\shidden(?:\s|=|>)|\saria-hidden\s*=\s*["']true["']|\sstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)))[^>]*>[\s\S]*?<\/\1\s*>/gi;
  while (hiddenElement.test(visible)) {
    hiddenElement.lastIndex = 0;
    visible = visible.replace(hiddenElement, ' ');
  }
  return visible
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&(?:amp|#38);/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function anchors(html) {
  const found = [];
  const pattern = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>[\s\S]*?<\/a\s*>/gi;
  for (const match of html.matchAll(pattern)) {
    found.push({ href: match[2], start: match.index, end: match.index + match[0].length });
  }
  return found;
}

function ids(html) {
  return [...html.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map((match) => match[2]);
}

test('the calculators link directly to each other without query or fragment data', () => {
  const resignationTargets = anchors(resignation).map(({ href }) => href);
  const annualLeaveTargets = anchors(annualLeave).map(({ href }) => href);
  assert.ok(resignationTargets.includes('/annual-leave-calculator.html'));
  assert.ok(annualLeaveTargets.includes('/resignation-calculator.html'));
  for (const target of resignationTargets.filter((href) => href.includes('annual-leave-calculator.html'))) {
    assert.doesNotMatch(target, /[?#]/, `Resignation interlink contains URL data: ${target}`);
  }
  for (const target of annualLeaveTargets.filter((href) => href.includes('resignation-calculator.html'))) {
    assert.doesNotMatch(target, /[?#]/, `Annual Leave interlink contains URL data: ${target}`);
  }
  for (const page of [resignation, annualLeave]) {
    assert.doesNotMatch(page, /(?:URLSearchParams|searchParams|getQueryParam|location\.search)/);
  }
});

test('each calculator owns one non-overlapping employment task', () => {
  const resignationText = visibleText(resignation);
  const annualLeaveText = visibleText(annualLeave);
  assert.match(resignationText, /Resignation does not recalculate entitlement/i);
  assert.match(resignationText, /Resignation only uses HR-confirmed cash-eligible or notice-offset days/i);
  assert.match(annualLeaveText, /Annual Leave calculates entitlement and balance only/i);
  assert.match(annualLeaveText, /Annual Leave does not calculate cash value/i);
  assert.match(annualLeaveText, /Annual Leave does not calculate notice pay, final salary or settlement totals/i);

  for (const id of ['leaveYearType', 'usedDays', 'carriedDays', 'adjustmentDays', 'unpaidRanges']) {
    assert.ok(annualLeave.includes(`id="${id}"`), `Annual Leave must own #${id}`);
    assert.ok(!resignation.includes(`id="${id}"`), `Resignation must not own #${id}`);
  }
  for (const id of ['noticeLength', 'finalMonthWorkDays', 'cashEligibleLeaveDays', 'offsetLeaveDays']) {
    assert.ok(resignation.includes(`id="${id}"`), `Resignation must own #${id}`);
    assert.ok(!annualLeave.includes(`id="${id}"`), `Annual Leave must not own #${id}`);
  }
});

test('inline JavaScript parses and every HTML id is unique', () => {
  for (const { name, html } of pages) {
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      const attributes = match[1];
      if (/\bsrc\s*=/i.test(attributes) || /\btype\s*=\s*["']application\/ld\+json["']/i.test(attributes)) continue;
      assert.doesNotThrow(() => new vm.Script(match[2], { filename: `${name} inline script` }));
    }
    for (const match of html.matchAll(/\son[a-z]+\s*=\s*(["'])(.*?)\1/gi)) {
      assert.doesNotThrow(() => new vm.Script(`(function(event){${match[2]}\n})`, { filename: `${name} inline handler` }));
    }

    const pageIds = ids(html);
    const duplicates = [...new Set(pageIds.filter((id, index) => pageIds.indexOf(id) !== index))];
    assert.deepEqual(duplicates, [], `${name} has duplicate HTML ids: ${duplicates.join(', ')}`);
  }
});

test('pages have no immediately adjacent links with the same target', () => {
  for (const { name, html } of pages) {
    const pageAnchors = anchors(html);
    for (let index = 1; index < pageAnchors.length; index += 1) {
      const previous = pageAnchors[index - 1];
      const current = pageAnchors[index];
      if (html.slice(previous.end, current.start).trim() === '') {
        assert.notEqual(current.href, previous.href, `${name} has adjacent duplicate links to ${current.href}`);
      }
    }
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
  for (const { html } of pages) {
    const pageText = visibleText(html);
    assert.match(pageText, /\[MOM-LEAVE-1\]/);
    assert.match(pageText, /Last reviewed: 10 August 2026/);
    assert.match(pageText, /statutory/i);
    assert.match(pageText, /company(?:-| )contract/i);
    assert.match(pageText, /HR-confirmed/i);
  }
});

test('all seven stage 6 user paths appear in visible content with a destination or review state', () => {
  const resignationText = visibleText(resignation);
  const annualLeaveText = visibleText(annualLeave);
  const paths = [
    { name: 'current leave balance', page: annualLeaveText, markers: [/Statutory estimate balance/, /Contract estimate balance/] },
    { name: 'prepare resignation notice', page: resignationText, markers: [/Contractual Notice Length/, /Contractual notice end/] },
    { name: 'resignation leave encashment', page: resignationText, markers: [/HR-confirmed Cash-eligible Leave Days/, /Leave encashment/i] },
    { name: 'unknown leave year', page: annualLeaveText, markers: [/choose actively/i, /no hidden default/i] },
    { name: 'multiple unpaid periods', page: annualLeaveText, markers: [/Add unpaid-leave period/, /multiple dated unpaid-leave periods/] },
    { name: 'unknown last attendance', page: resignationText, markers: [/Actual Last Scheduled Attendance/, /Not yet confirmed/] },
    { name: 'HR or manual confirmation', page: `${resignationText} ${annualLeaveText}`, markers: [/manual review/i, /confirm them with HR first/i] },
  ];
  for (const path of paths) {
    for (const marker of path.markers) assert.match(path.page, marker, `${path.name} is missing ${marker}`);
  }
});
