import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const pages = (await readdir(root)).filter(name => name.endsWith('.html'));
const html = new Map(await Promise.all(pages.map(async name => [name, await readFile(new URL(name,root),'utf8')])));
const expectedLinks = ['/', '/tools.html', '/guides.html', '/about.html'];

function block(source, name) {
  const blocks = [...source.matchAll(new RegExp(`<!-- sgsp:${name}:start -->([\\s\\S]*?)<!-- sgsp:${name}:end -->`, 'g'))];
  assert.equal(blocks.length, 1, name);
  return blocks[0][1].replaceAll('\r\n','\n').trim();
}

test('all 24 static pages have an identical footer and both navigations in the same order', () => {
  assert.equal(pages.length,24);
  const footer = block(html.get('index.html'),'footer');
  for (const [name,source] of html) {
    const header = block(source,'header');
    const nav = [...header.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/g)];
    assert.equal(nav.length,2,name);
    for (const [,markup] of nav) assert.deepEqual([...markup.matchAll(/href="([^"]+)"/g)].map(match=>match[1]),expectedLinks,name);
    assert.match(header,/<a class="sgsp-brand" href="\/">/,name);
    assert.match(header,/<details class="sgsp-mobile-menu">[\s\S]*?<summary>/,name);
    assert.equal(block(source,'footer'),footer,name);
  }
});

test('breadcrumbs and skip targets preserve the hierarchy of every static page', () => {
  for (const [name,source] of html) {
    const trail = block(source,'breadcrumb');
    assert.match(trail,/id="sgsp-main"/,name);
    if (name === 'index.html') continue;
    assert.match(trail,/href="\/">Home<\/a>/,name);
    assert.match(trail,/aria-current="page"/,name);
    if (/calculator\.html$|salary-benchmark-explorer\.html$/.test(name)) assert.match(trail,/href="\/tools\.html"/,name);
    if (/^(guide-|is-higher-)/.test(name)) assert.match(trail,/href="\/guides\.html"/,name);
  }
});
