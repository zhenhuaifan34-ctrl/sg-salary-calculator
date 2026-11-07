import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root=resolve(import.meta.dirname,'..');
const files=(await readdir(root)).filter(f=>f.endsWith('.html'));
const origin='https://sg-salary-calculator.vercel.app';
const attr=(tag,key)=>tag.match(new RegExp('\\b'+key+'=["\']([^"\']*)["\']','i'))?.[1];
const html=Object.fromEntries(await Promise.all(files.map(async f=>[f,await readFile(resolve(root,f),'utf8')])));

test('every current page has one self canonical, unique title/description and H1',()=>{
 const titles=new Set(),descriptions=new Set();
 for(const f of files){
  const h=html[f],url=origin+'/'+(f==='index.html'?'':f);
  const canonical=[...h.matchAll(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi)];
  assert.equal(canonical.length,1,f);
  assert.equal(attr(canonical[0][0],'href'),url,f);
  const title=h.match(/<title>([\s\S]*?)<\/title>/i)?.[1].trim();
  assert.ok(title && !titles.has(title),f+' duplicate or missing title');titles.add(title);
  const description=[...h.matchAll(/<meta\b[^>]*name=["']description["'][^>]*>/gi)];
  assert.equal(description.length,1,f);const d=attr(description[0][0],'content');
  assert.ok(d?.length>=35 && !descriptions.has(d),f+' description');descriptions.add(d);
  assert.equal([...h.matchAll(/<h1\b/gi)].length,1,f);
  assert.ok(!/<meta\b[^>]*name=["']robots["'][^>]*noindex/i.test(h),f);
 }
});

test('sitemap equals existing canonical pages with real recovery modification dates',async()=>{
 const sitemap=await readFile(resolve(root,'sitemap.xml'),'utf8');
 const locations=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
 const expected=files.map(f=>origin+'/'+(f==='index.html'?'':f)).sort();
 assert.deepEqual([...locations].sort(),expected);assert.equal(new Set(locations).size,files.length);
 for(const block of sitemap.match(/<url>[\s\S]*?<\/url>/g))assert.match(block,/<lastmod>2026-11-07<\/lastmod>/);
 const robots=await readFile(resolve(root,'robots.txt'),'utf8');
 assert.ok(!/^Disallow:\s*\/\s*$/mi.test(robots));assert.match(robots,/Sitemap: https:\/\/sg-salary-calculator.vercel.app\/sitemap.xml/);
});

test('all local navigational and script/style targets resolve; no extra calculator URL',async()=>{
 for(const [f,h] of Object.entries(html))for(const m of h.matchAll(/<(?:a|script|link)\b[^>]*(?:href|src)=["']([^"']*)["']/gi)){
  const href=m[1];if(!href||href.startsWith('#')||/^(?:data:|mailto:|tel:|javascript:|\/\/)/i.test(href))continue;
  const u=new URL(href,origin+'/'+f);if(u.origin!==origin)continue;
  const path=decodeURIComponent(u.pathname)==='/'?'index.html':decodeURIComponent(u.pathname).replace(/^\//,'');
  await assert.doesNotReject(access(resolve(root,path)),`${f} -> ${href}`);
 }
 assert.equal(files.filter(f=>f.endsWith('-calculator.html')).length,5);
});

test('all guides expose actual source verification, examples and Article metadata',()=>{
 for(const f of files.filter(f=>f.startsWith('guide-')||f.startsWith('is-higher-'))){
  const h=html[f];assert.match(h,/https:\/\/(?:www\.)?(?:mom|cpf|iras)\.gov\.sg|https:\/\/stats\.mom\.gov\.sg/,f);
  assert.match(h,/2026-11-07/,f);assert.match(h,/example|illustration/i,f);
  const blocks=[...h.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m=>JSON.parse(m[1]));
  assert.ok(blocks.some(b=>b['@type']==='Article'),f);
 }
});
