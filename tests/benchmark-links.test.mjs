import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..');
const origin = 'https://sg-salary-calculator.vercel.app';
const benchmark = '/salary-benchmark-explorer.html';
const salary = '/salary-calculator.html';
const leave = '/annual-leave-calculator.html';
const resignation = '/resignation-calculator.html';
const offer = '/offer-comparison-calculator.html';
const jobSwitch = '/job-switch-worth-it-calculator.html';
const tools = [benchmark, salary, leave, resignation, offer, jobSwitch];
const guides = (await readdir(root))
  .filter((file) => /^(guide-|is-higher-).*\.html$/.test(file))
  .map((file) => '/' + file);

function load(page) {
  return readFile(join(root, page === '/' ? 'index.html' : page.slice(1)), 'utf8');
}

function internalLinks(html, page) {
  return [...html.matchAll(/<a\b[^>]*\bhref=(["'])([^"']*)\1/gi)]
    .map((match) => new URL(match[2], origin + page))
    .filter((url) => url.origin === origin)
    .map((url) => url.pathname);
}

test('directories provide static routes to all six tools and thirteen existing guides', async () => {
  const toolsLinks = internalLinks(await load('/tools.html'), '/tools.html');
  const guidesLinks = internalLinks(await load('/guides.html'), '/guides.html');
  assert.equal(guides.length, 13);
  for (const page of tools) assert.ok(toolsLinks.includes(page), page);
  for (const page of guides) assert.ok(guidesLinks.includes(page), page);
});

test('all thirteen guides link back to the directory and have contextual next steps', async () => {
  for (const page of guides) {
    const html = await load(page);
    const bodyLinks = internalLinks(html.replace(/<nav\b[\s\S]*?<\/nav>/gi, ''), page);
    assert.ok(bodyLinks.includes('/guides.html'), page + ' missing Guides return link');
    assert.ok(bodyLinks.some((target) => tools.includes(target)), page + ' missing contextual tool');
    assert.ok(bodyLinks.some((target) => target !== page && guides.includes(target)), page + ' missing related guide');
  }
});

test('legacy calculators preserve the key related journeys and connect to Explorer where relevant', async () => {
  const required = [
    [salary, [benchmark, '/guide-cpf-2026.html', '/guide-income-tax-2026.html',
      '/guide-overtime-pay-2026.html', '/guide-salary-increment-2026.html']],
    [leave, [resignation, '/guide-annual-leave-2026.html', '/guide-public-holiday-2026.html', '/guide-2026.html']],
    [resignation, [leave, jobSwitch, '/guide-resignation-2026.html', '/guide-2026.html']],
    [offer, [benchmark, salary, jobSwitch, '/guide-salary-increment-2026.html']],
    [jobSwitch, [benchmark, offer, resignation, '/guide-salary-increase-switching-jobs-2026.html']],
  ];
  for (const [source, targets] of required) {
    const links = internalLinks(await load(source), source);
    for (const target of targets) assert.ok(links.includes(target), source + ' misses ' + target);
  }
});
