import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const productionOrigin = 'https://sg-salary-calculator.vercel.app';
const htmlFiles = (await readdir(root)).filter((file) => file.endsWith('.html')).sort();
const htmlByFile = new Map(await Promise.all(
  htmlFiles.map(async (file) => [file, await readFile(join(root, file), 'utf8')]),
));
const affectedPages = new Map([
  ['index.html', `${productionOrigin}/`],
  ['annual-leave-calculator.html', `${productionOrigin}/annual-leave-calculator.html`],
  ['resignation-calculator.html', `${productionOrigin}/resignation-calculator.html`],
  ['guide-annual-leave-2026.html', `${productionOrigin}/guide-annual-leave-2026.html`],
  ['guide-resignation-2026.html', `${productionOrigin}/guide-resignation-2026.html`],
  ['salary-calculator.html', `${productionOrigin}/salary-calculator.html`],
  ['offer-comparison-calculator.html', `${productionOrigin}/offer-comparison-calculator.html`],
]);
const legacySitemapUrls = [
  `${productionOrigin}/`,
  `${productionOrigin}/about.html`,
  `${productionOrigin}/guide-2026.html`,
  `${productionOrigin}/guide-lqs-2026.html`,
  `${productionOrigin}/guide-resignation-2026.html`,
  `${productionOrigin}/privacy.html`,
  `${productionOrigin}/guide-cpf-2026.html`,
  `${productionOrigin}/guide-annual-leave-2026.html`,
  `${productionOrigin}/guide-income-tax-2026.html`,
  `${productionOrigin}/guide-public-holiday-2026.html`,
  `${productionOrigin}/guide-overtime-pay-2026.html`,
  `${productionOrigin}/guide-13th-month-bonus-2026.html`,
  `${productionOrigin}/guide-salary-increment-2026.html`,
  `${productionOrigin}/resignation-calculator.html`,
  `${productionOrigin}/salary-calculator.html`,
  `${productionOrigin}/offer-comparison-calculator.html`,
];
const prohibitedPages = [
  'foreigner-income-tax-calculator.html',
  'leave-encashment-calculator.html',
  'notice-period-calculator.html',
  'pro-rated-annual-leave-calculator.html',
];

function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((match) => match[0]);
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2];
}

function head(html) {
  const match = html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i);
  assert.ok(match, 'Missing document head');
  return match[1];
}

function oneMeta(pageHead, key, value) {
  const matches = tags(pageHead, 'meta').filter((tag) => attribute(tag, key)?.toLowerCase() === value.toLowerCase());
  assert.equal(matches.length, 1, `Expected one ${key}=${value}`);
  const content = attribute(matches[0], 'content')?.trim();
  assert.ok(content, `${key}=${value} has empty content`);
  return content;
}

function oneCanonical(pageHead) {
  const matches = tags(pageHead, 'link').filter((tag) => attribute(tag, 'rel')?.toLowerCase() === 'canonical');
  assert.equal(matches.length, 1, 'Expected one canonical link');
  return attribute(matches[0], 'href');
}

function jsonLdBlocks(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter((match) => attribute(`<script ${match[1]}>`, 'type')?.toLowerCase() === 'application/ld+json')
    .map((match) => match[2]);
}

function visit(value, callback) {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, callback);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    callback(key, child);
    visit(child, callback);
  }
}

function internalTarget(sourceFile, href) {
  if (/^(?:https?:|mailto:|tel:|javascript:|data:|\/\/)/i.test(href) || href.startsWith('#')) return null;
  const path = href.split(/[?#]/, 1)[0];
  if (!path) return null;
  if (path === '/') return join(root, 'index.html');
  if (path.startsWith('/')) return join(root, path.slice(1));
  return resolve(root, dirname(sourceFile), path);
}

test('sitemap adds Annual Leave while preserving every legacy URL and valid local target', async () => {
  const xml = await readFile(join(root, 'sitemap.xml'), 'utf8');
  assert.match(xml, /<urlset\b[^>]*>[\s\S]*<\/urlset\s*>/i);
  const urls = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1]);
  assert.ok(urls.includes(`${productionOrigin}/annual-leave-calculator.html`));
  for (const url of legacySitemapUrls) assert.ok(urls.includes(url), `Sitemap dropped legacy URL: ${url}`);
  assert.equal(new Set(urls).size, urls.length, 'Sitemap contains duplicate URLs');

  for (const value of urls) {
    const url = new URL(value);
    assert.equal(url.origin, productionOrigin, `Non-production sitemap origin: ${value}`);
    assert.equal(url.search, '', `Sitemap URL contains query data: ${value}`);
    assert.equal(url.hash, '', `Sitemap URL contains a fragment: ${value}`);
    const target = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    assert.ok(existsSync(join(root, target)), `Sitemap target is missing: ${target}`);
  }

  for (const file of prohibitedPages) assert.ok(!urls.some((url) => url.endsWith(`/${file}`)), `Prohibited sitemap URL: ${file}`);
});

test('affected pages have complete, accurate and self-referencing metadata with one H1', () => {
  const canonicalUrls = [];
  for (const [file, expectedCanonical] of affectedPages) {
    const html = htmlByFile.get(file);
    const pageHead = head(html);
    const titles = [...pageHead.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi)];
    assert.equal(titles.length, 1, `${file} must have one title`);
    assert.ok(titles[0][1].replace(/<[^>]+>/g, '').trim(), `${file} has an empty title`);
    oneMeta(pageHead, 'name', 'description');
    oneMeta(pageHead, 'property', 'og:title');
    oneMeta(pageHead, 'property', 'og:description');

    const canonical = oneCanonical(pageHead);
    assert.equal(canonical, expectedCanonical, `${file} canonical does not self-reference its production URL`);
    assert.equal(oneMeta(pageHead, 'property', 'og:url'), canonical, `${file} OG URL differs from canonical`);
    assert.doesNotMatch(canonical, /[?#]|localhost|vercel\.app\/.*(?:preview|git-)/i, `${file} has a temporary or data-bearing canonical`);
    canonicalUrls.push(canonical);

    const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)];
    assert.equal(h1s.length, 1, `${file} must have exactly one H1`);
    assert.ok(h1s[0][1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), `${file} has an empty H1`);
  }
  assert.equal(new Set(canonicalUrls).size, canonicalUrls.length, 'Affected pages share a duplicate canonical URL');
});

test('JSON-LD parses, self-references correctly and contains no fabricated trust signals', () => {
  const forbiddenKeys = new Set(['aggregaterating', 'ratingvalue', 'review', 'reviewcount']);
  for (const [file, canonical] of affectedPages) {
    const html = htmlByFile.get(file);
    const blocks = jsonLdBlocks(html);
    assert.ok(blocks.length, `${file} has no JSON-LD`);
    for (const block of blocks) {
      let value;
      assert.doesNotThrow(() => { value = JSON.parse(block); }, `${file} contains invalid JSON-LD`);
      if (typeof value.url === 'string') assert.equal(value.url, canonical, `${file} JSON-LD URL differs from canonical`);
      if (value.mainEntityOfPage?.['@id']) assert.equal(value.mainEntityOfPage['@id'], canonical, `${file} JSON-LD mainEntityOfPage differs from canonical`);
      visit(value, (key) => assert.ok(!forbiddenKeys.has(key.toLowerCase()), `${file} contains unverified JSON-LD field: ${key}`));
      assert.doesNotMatch(JSON.stringify(value), /\b(?:government|MOM|CPF Board)\s+(?:approved|certified|endorsed|recognised|recognized)\b/i, `${file} claims unverified official approval`);
    }
  }
  assert.doesNotMatch(htmlByFile.get('index.html'), /"@type"\s*:\s*"SearchAction"/i, 'Homepage declares a site search action that does not exist');
});

test('robots allows important pages and names the production sitemap', async () => {
  const robots = await readFile(join(root, 'robots.txt'), 'utf8');
  assert.match(robots, /^User-agent:\s*\*/mi);
  assert.match(robots, /^Allow:\s*\/\s*$/mi);
  assert.match(robots, new RegExp(`^Sitemap:\\s*${productionOrigin.replaceAll('.', '\\.')}\\/sitemap\\.xml\\s*$`, 'mi'));
  const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)\s*$/gmi)].map((match) => match[1]);
  for (const [file] of affectedPages) {
    const path = file === 'index.html' ? '/' : `/${file}`;
    assert.ok(!disallowed.some((rule) => rule === '/' || path.startsWith(rule)), `robots blocks ${path}`);
  }
});

test('vercel configuration remains valid JSON', async () => {
  const source = await readFile(join(root, 'vercel.json'), 'utf8');
  assert.doesNotThrow(() => JSON.parse(source));
});

test('all internal links resolve and prohibited duplicate directions stay absent', () => {
  const combined = [...htmlByFile.values()].join('\n');
  for (const [file, html] of htmlByFile) {
    for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi)) {
      const target = internalTarget(file, match[2]);
      if (!target) continue;
      assert.equal(relative(root, target).startsWith('..'), false, `${file} links outside the repository: ${match[2]}`);
      assert.ok(existsSync(target), `${file} has a missing internal target: ${match[2]}`);
    }
  }
  for (const file of prohibitedPages) {
    assert.ok(!htmlFiles.includes(file), `${file} must remain absent`);
    assert.ok(!combined.includes(file), `${file} must not be promoted`);
  }
});

test('every HTML file has unique IDs and syntactically valid inline JavaScript', () => {
  for (const [file, html] of htmlByFile) {
    const ids = [...html.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map((match) => match[2]);
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    assert.deepEqual(duplicates, [], `${file} has duplicate HTML IDs: ${duplicates.join(', ')}`);

    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      if (/\bsrc\s*=/i.test(match[1]) || /\btype\s*=\s*["']application\/ld\+json["']/i.test(match[1])) continue;
      assert.doesNotThrow(() => new vm.Script(match[2], { filename: `${file} inline script` }));
    }
    for (const match of html.matchAll(/\son[a-z]+\s*=\s*(["'])(.*?)\1/gi)) {
      assert.doesNotThrow(() => new vm.Script(`(function(event){${match[2]}\n})`, { filename: `${file} inline handler` }));
    }
  }
});
