import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { findOccupations, hasBand, parsePay, salaryBand } from '../benchmark-model.mjs';

const read = async (name) => JSON.parse(await readFile(new URL('../data/' + name + '.json', import.meta.url), 'utf8'));
const wages = await read('benchmark-occupations');
const income = await read('benchmark-income-trend');
const software = wages.occupations.find(row => row.id === 'software-developer');

test('occupation search ranks an exact title first and accepts multiple keywords and official code', () => {
  assert.equal(findOccupations(wages.occupations, '  SOFTWARE Developer  ')[0].id, software.id);
  assert.ok(findOccupations(wages.occupations, 'developer software').some(row => row.id === software.id));
  assert.equal(findOccupations(wages.occupations, software.occupation_code)[0].id, software.id);
  assert.deepEqual(findOccupations(wages.occupations, 'xzzxpq-not-an-occupation'), []);
  assert.ok(findOccupations(wages.occupations, '', software.category).every(row => row.category === software.category));
});

test('all published wage figures preserve order and independent official spot checks', () => {
  assert.equal(wages.reference_year, 2024);
  assert.equal(wages.reference_month, 6);
  assert.equal(wages.occupations.length, 562);
  assert.equal(new Set(wages.occupations.map(row => row.id)).size, 562);
  assert.ok(wages.occupations.every(row => hasBand(row)));
  assert.deepEqual([software.p25, software.median, software.p75], [6658, 8888, 13513]);
  const accountant = wages.occupations.find(row => row.id === 'accountant-excluding-tax-accountant');
  assert.deepEqual([accountant.p25, accountant.median, accountant.p75], [4600, 5498, 6695]);
  assert.match(wages.source_url, /^https:\/\/data\.gov\.sg\//);
  assert.equal(wages.latest_official_release.imported, false);
});

test('personal pay bands define equality and omit conclusions if the data is incomplete', () => {
  assert.match(salaryBand(software, 6657.99), /^Below/);
  for (const amount of [6658, 8887.99]) assert.match(salaryBand(software, amount), /^From the 25th/);
  for (const amount of [8888, 13513]) assert.match(salaryBand(software, amount), /^From the median/);
  assert.match(salaryBand(software, 13513.01), /^Above/);
  for (const row of [{ ...software, p25: null }, { ...software, p75: '13513' }, { ...software, median: 900000 }]) {
    assert.equal(salaryBand(row, 10000), null);
  }
  assert.equal(salaryBand({ p25: 3500, median: 3500, p75: 3500 }, 3500), 'From the median through the 75th percentile');
});

test('pay input accepts grouped SGD values and rejects malformed, negative, and unbounded inputs', () => {
  assert.equal(parsePay(' 13,513.01 '), 13513.01);
  assert.equal(parsePay('5500'), 5500);
  for (const value of ['', '0', '-1', '1e7', '5,5', '5.111', '10000000.01', 'Infinity']) {
    assert.equal(parsePay(value), null, value);
  }
});

test('national income trend is a separate continuous nominal series with bonuses and CPF included', () => {
  assert.equal(income.bonuses_included, true);
  assert.equal(wages.bonuses_included, false);
  assert.notEqual(income.source_url, wages.source_url);
  assert.deepEqual(income.series.map(row => row.year), Array.from({ length: 11 }, (_, i) => 2015 + i));
  assert.deepEqual(income.series.slice(-2), [{ year: 2024, median: 5500 }, { year: 2025, median: 5775 }]);
});
