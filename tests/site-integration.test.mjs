import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const htmlFiles = (await readdir(root)).filter((file) => file.endsWith('.html')).sort();
const htmlByFile = new Map(await Promise.all(htmlFiles.map(async (file) => [file, await readFile(join(root, file), 'utf8')])));
const toolPages = [
  'salary-calculator.html',
  'annual-leave-calculator.html',
  'resignation-calculator.html',
  'offer-comparison-calculator.html',
  'job-switch-worth-it-calculator.html',
];
const prohibitedPages = [
  'foreigner-income-tax-calculator.html',
  'leave-encashment-calculator.html',
  'notice-period-calculator.html',
  'pro-rated-annual-leave-calculator.html',
];

function withoutNonVisibleContent(html) {
  let visible = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const hidden = /<([a-z][\w:-]*)\b(?=[^>]*(?:\shidden(?:\s|=|>)|\saria-hidden\s*=\s*["']true["']|\sstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)))[^>]*>[\s\S]*?<\/\1\s*>/gi;
  while (hidden.test(visible)) {
    hidden.lastIndex = 0;
    visible = visible.replace(hidden, ' ');
  }
  return visible;
}

function anchors(html, visibleOnly = false) {
  const source = visibleOnly ? withoutNonVisibleContent(html) : html;
  const found = [];
  const pattern = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi;
  for (const match of source.matchAll(pattern)) {
    found.push({
      href: match[2],
      text: match[3].replace(/<[^>]+>/g, ' ').replace(/&(?:nbsp|#160);/gi, ' ').replace(/&(?:amp|#38);/gi, '&').replace(/\s+/g, ' ').trim(),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return found;
}

function section(html, marker) {
  const match = html.match(new RegExp(`<section\\b[^>]*${marker}[^>]*>[\\s\\S]*?<\\/section\\s*>`, 'i'));
  assert.ok(match, `Missing section matching ${marker}`);
  return match[0];
}

function footer(html) {
  const matches = [...html.matchAll(/<footer\b[^>]*>[\s\S]*?<\/footer\s*>/gi)];
  assert.ok(matches.length, 'Missing footer');
  return matches.at(-1)[0];
}

function hasVisibleLink(html, href, label) {
  const expected = new URL(href, 'https://sg-salary-calculator.vercel.app/').href;
  return anchors(html, true).some((anchor) => new URL(anchor.href, 'https://sg-salary-calculator.vercel.app/').href === expected && label.test(anchor.text));
}

function internalTarget(sourceFile, href) {
  if (/^(?:https?:|mailto:|tel:|javascript:|data:)/i.test(href) || href.startsWith('#')) return null;
  const path = href.split(/[?#]/, 1)[0];
  if (!path) return null;
  if (path === '/') return join(root, 'index.html');
  if (path.startsWith('/')) return join(root, path.slice(1));
  return resolve(root, dirname(sourceFile), path);
}

test('homepage navigation, tool list, topic group and footer reach both employment tools', () => {
  const home = htmlByFile.get('index.html');
  const navigation = home.match(/<nav\b[^>]*class=["'][^"']*nav[^"']*["'][^>]*>[\s\S]*?<\/nav\s*>/i)?.[0];
  assert.ok(navigation, 'Homepage navigation is missing');
  const tools = section(home, "id=[\"']tools[\"']");
  const topics = section(home, "id=[\"']topics[\"']");
  const homeFooter = footer(home);
  for (const area of [navigation, tools, topics, homeFooter]) {
    assert.ok(hasVisibleLink(area, 'annual-leave-calculator.html', /Annual Leave/i), 'Homepage area is missing a visible Annual Leave Calculator link');
    assert.ok(hasVisibleLink(area, 'resignation-calculator.html', /Resignation/i), 'Homepage area is missing a visible Resignation Calculator link');
  }
});

test('leave and resignation guides point to the correct calculators with accurate labels', () => {
  const leaveGuide = htmlByFile.get('guide-annual-leave-2026.html');
  const resignationGuide = htmlByFile.get('guide-resignation-2026.html');
  assert.ok(hasVisibleLink(leaveGuide, '/annual-leave-calculator.html', /^Annual Leave Calculator$/i));
  assert.ok(hasVisibleLink(resignationGuide, '/resignation-calculator.html', /^Resignation Calculator$/i));
  assert.doesNotMatch(resignationGuide, /href=["']\/index\.html["'][^>]*>\s*<strong>MOM Notice & Leave Encashment Calculator/i);
});

test('salary guides keep natural links to their most relevant tools', () => {
  const contracts = [
    ['guide-salary-increment-2026.html', '/salary-calculator.html', /Salary Calculator|Net Pay Calculator/i],
    ['guide-salary-benchmark-2026.html', 'salary-calculator.html', /Salary Calculator|take-home pay/i],
    ['guide-salary-benchmark-2026.html', 'offer-comparison-calculator.html', /Offer Comparison Calculator/i],
    ['guide-salary-increase-switching-jobs-2026.html', 'offer-comparison-calculator.html', /Compare|Offer Comparison Calculator/i],
  ];
  for (const [file, href, label] of contracts) {
    assert.ok(hasVisibleLink(htmlByFile.get(file), href, label), `${file} lacks an accurate visible link to ${href}`);
  }
});

test('all internal links resolve across root-relative and relative URL forms', () => {
  for (const [file, html] of htmlByFile) {
    for (const { href } of anchors(html)) {
      const target = internalTarget(file, href);
      if (!target) continue;
      assert.equal(relative(root, target).startsWith('..'), false, `${file} links outside the repository: ${href}`);
      assert.ok(existsSync(target), `${file} has a missing internal target: ${href}`);
    }
  }
});

test('tool URLs carry no query, fragment or personal input data', () => {
  const toolPattern = new RegExp(`(?:^|/)(${toolPages.map((file) => file.replaceAll('.', '\\.')).join('|')})(?:[?#]|$)`, 'i');
  for (const [file, html] of htmlByFile) {
    for (const { href } of anchors(html)) {
      if (!toolPattern.test(href)) continue;
      assert.doesNotMatch(href, /[?#]/, `${file} passes URL data to a tool: ${href}`);
    }
  }
});

test('employment tools remain bidirectional and prohibited duplicate URLs stay absent', () => {
  assert.ok(hasVisibleLink(htmlByFile.get('annual-leave-calculator.html'), '/resignation-calculator.html', /Resignation/i));
  assert.ok(hasVisibleLink(htmlByFile.get('resignation-calculator.html'), '/annual-leave-calculator.html', /annual leave/i));
  const allHtml = [...htmlByFile.values()].join('\n');
  for (const file of prohibitedPages) {
    assert.ok(!htmlFiles.includes(file), `${file} must remain absent`);
    assert.ok(!allHtml.includes(file), `${file} must not be promoted while its direction is WAIT`);
  }
});

test('pages have unique canonical URLs and no exact adjacent duplicate links', () => {
  const canonicals = [];
  for (const [file, html] of htmlByFile) {
    const canonical = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1];
    if (canonical) canonicals.push([file, canonical]);
    const pageAnchors = anchors(html);
    for (let index = 1; index < pageAnchors.length; index += 1) {
      const previous = pageAnchors[index - 1];
      const current = pageAnchors[index];
      const adjacent = html.slice(previous.end, current.start).trim() === '';
      assert.ok(!(adjacent && current.href === previous.href && current.text === previous.text), `${file} repeats an identical adjacent link to ${current.href}`);
    }
  }
  const urls = canonicals.map(([, canonical]) => canonical);
  assert.equal(new Set(urls).size, urls.length, `Duplicate canonical URLs: ${urls.filter((url, index) => urls.indexOf(url) !== index).join(', ')}`);
});

test('every page has valid inline JavaScript and unique HTML ids', () => {
  for (const [file, html] of htmlByFile) {
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      if (/\bsrc\s*=/i.test(match[1]) || /\btype\s*=\s*["']application\/ld\+json["']/i.test(match[1])) continue;
      assert.doesNotThrow(() => new vm.Script(match[2], { filename: `${file} inline script` }));
    }
    for (const match of html.matchAll(/\son[a-z]+\s*=\s*(["'])(.*?)\1/gi)) {
      assert.doesNotThrow(() => new vm.Script(`(function(event){${match[2]}\n})`, { filename: `${file} inline handler` }));
    }
    const ids = [...html.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map((match) => match[2]);
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    assert.deepEqual(duplicates, [], `${file} has duplicate HTML ids: ${duplicates.join(', ')}`);
  }
});
