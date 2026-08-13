import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const rules = require('../employment-rules.js');

function input(overrides = {}) {
  return {
    hireDate: '2026-01-01',
    calculationDate: '2026-12-31',
    leaveYearType: 'calendar',
    leaveYearReference: '2026-06-01',
    customLeaveYearStart: '',
    contractAnnualDays: 14,
    contractProrationPolicy: 'completed-months',
    contractEligibilityPolicy: 'after-three-months',
    usedDays: 0,
    carriedDays: 0,
    adjustmentDays: 0,
    unpaidRanges: [],
    unpaidTotalDays: '',
    ...overrides,
  };
}

test('MOM service-year table and half-day rounding are frozen', () => {
  assert.deepEqual(Array.from({ length: 10 }, (_, index) => rules.statutoryAnnualLeaveDays(index + 1)), [7, 8, 9, 10, 11, 12, 13, 14, 14, 14]);
  assert.equal(rules.roundLeaveDays(3.49), 3);
  assert.equal(rules.roundLeaveDays(3.5), 4);
});

test('calendar, anniversary and custom leave years require explicit inputs', () => {
  assert.deepEqual(rules.leaveYearWindow({ leaveYearType: 'calendar', leaveYearReference: '2026-08-10', hireDate: '2024-03-14' }), {
    type: 'calendar', start: { year: 2026, month: 1, day: 1 }, end: { year: 2026, month: 12, day: 31 },
  });
  assert.deepEqual(rules.leaveYearWindow({ leaveYearType: 'anniversary', leaveYearReference: '2026-08-10', hireDate: '2024-03-14' }), {
    type: 'anniversary', start: { year: 2026, month: 3, day: 14 }, end: { year: 2027, month: 3, day: 13 }, serviceYear: 3,
  });
  assert.deepEqual(rules.leaveYearWindow({ leaveYearType: 'custom', customLeaveYearStart: '2026-04-01', hireDate: '2024-03-14' }), {
    type: 'custom', start: { year: 2026, month: 4, day: 1 }, end: { year: 2027, month: 3, day: 31 },
  });
  assert.throws(() => rules.leaveYearWindow({ leaveYearType: '', hireDate: '2024-03-14' }), /Choose Calendar year/);
});

test('all three leave-year types calculate a full 12 completed service months', () => {
  const calendar = rules.calculateAnnualLeave(input());
  const anniversary = rules.calculateAnnualLeave(input({
    hireDate: '2024-03-14', calculationDate: '2027-03-13', leaveYearType: 'anniversary', leaveYearReference: '2026-08-01',
  }));
  const custom = rules.calculateAnnualLeave(input({
    hireDate: '2020-01-01', calculationDate: '2027-03-31', leaveYearType: 'custom', leaveYearReference: '', customLeaveYearStart: '2026-04-01',
  }));
  assert.equal(calendar.service.includedCompletedMonths, 12);
  assert.equal(anniversary.service.includedCompletedMonths, 12);
  assert.equal(custom.service.includedCompletedMonths, 12);
});

test('first full service year produces 7 statutory days and a separate 14-day contract result', () => {
  const result = rules.calculateAnnualLeave(input());
  assert.deepEqual(result.errors, []);
  assert.equal(result.statutory.raw, 7);
  assert.equal(result.statutory.rounded, 7);
  assert.equal(result.contract.raw, 14);
  assert.equal(result.contract.rounded, 14);
  assert.equal(result.totalDeterminate, true);
});

test('service under 3 months has no statutory entitlement while a confirmed contract can start immediately', () => {
  const result = rules.calculateAnnualLeave(input({ calculationDate: '2026-02-28', contractEligibilityPolicy: 'from-start' }));
  assert.equal(result.service.statutoryEligible, false);
  assert.equal(result.statutory.rounded, 0);
  assert.equal(result.contract.rounded, 2);
});

test('mid-year hire and mid-year cutoff use only completed service months', () => {
  const midHire = rules.calculateAnnualLeave(input({ hireDate: '2026-05-15' }));
  assert.equal(midHire.service.includedCompletedMonths, 7);
  assert.equal(midHire.statutory.rounded, 4);
  const cutoff = rules.calculateAnnualLeave(input({ calculationDate: '2026-06-30', leaveYearReference: '2026-02-01', contractAnnualDays: 7 }));
  assert.equal(cutoff.service.includedCompletedMonths, 6);
  assert.equal(cutoff.statutory.raw, 3.5);
  assert.equal(cutoff.statutory.rounded, 4);
});

test('a calendar year crossing a service anniversary applies each statutory tier month by month', () => {
  const result = rules.calculateAnnualLeave(input({ hireDate: '2025-07-01', calculationDate: '2026-12-31' }));
  assert.deepEqual(result.statutory.breakdown, [{ annualDays: 7, months: 6 }, { annualDays: 8, months: 6 }]);
  assert.equal(result.statutory.raw, 7.5);
  assert.equal(result.statutory.rounded, 8);
});

test('overlapping and adjacent unpaid ranges merge without duplicate days', () => {
  const result = rules.calculateAnnualLeave(input({
    contractAnnualDays: 12,
    unpaidRanges: [
      { start: '2026-01-01', end: '2026-01-10' },
      { start: '2026-01-05', end: '2026-01-20' },
      { start: '2026-01-21', end: '2026-01-31' },
    ],
  }));
  assert.deepEqual(result.unpaidLeave.normalizedRanges, [{ start: '2026-01-01', end: '2026-01-31' }]);
  assert.equal(result.unpaidLeave.uniqueDays, 31);
  assert.equal(result.service.excludedCompleteMonths, 1);
  assert.equal(result.service.includedCompletedMonths, 11);
  assert.equal(result.contract.raw, 11);
});

test('cross-month and cross-leave-year unpaid ranges split correctly', () => {
  const ranges = rules.normalizeDateRanges([{ start: '2026-12-20', end: '2027-01-10' }]);
  assert.deepEqual(rules.splitRangesByLeaveYear(ranges, {
    leaveYearType: 'calendar', hireDate: rules.parseCivilDate('2020-01-01'), customLeaveYearStart: null,
  }), [
    { leaveYearStart: '2026-01-01', leaveYearEnd: '2026-12-31', start: '2026-12-20', end: '2026-12-31', days: 12 },
    { leaveYearStart: '2027-01-01', leaveYearEnd: '2027-12-31', start: '2027-01-01', end: '2027-01-10', days: 10 },
  ]);
});

test('anniversary and custom company boundaries split unpaid ranges without changing days', () => {
  const anniversaryRanges = rules.normalizeDateRanges([{ start: '2026-03-10', end: '2026-03-20' }]);
  assert.deepEqual(rules.splitRangesByLeaveYear(anniversaryRanges, {
    leaveYearType: 'anniversary', hireDate: rules.parseCivilDate('2024-03-14'), customLeaveYearStart: null,
  }), [
    { leaveYearStart: '2025-03-14', leaveYearEnd: '2026-03-13', start: '2026-03-10', end: '2026-03-13', days: 4 },
    { leaveYearStart: '2026-03-14', leaveYearEnd: '2027-03-13', start: '2026-03-14', end: '2026-03-20', days: 7 },
  ]);
  const customRanges = rules.normalizeDateRanges([{ start: '2026-03-28', end: '2026-04-03' }]);
  assert.deepEqual(rules.splitRangesByLeaveYear(customRanges, {
    leaveYearType: 'custom', hireDate: rules.parseCivilDate('2020-01-01'), customLeaveYearStart: rules.parseCivilDate('2026-04-01'),
  }), [
    { leaveYearStart: '2025-04-01', leaveYearEnd: '2026-03-31', start: '2026-03-28', end: '2026-03-31', days: 4 },
    { leaveYearStart: '2026-04-01', leaveYearEnd: '2027-03-31', start: '2026-04-01', end: '2026-04-03', days: 3 },
  ]);
});

test('a repeated same-day unpaid range is deducted once', () => {
  const ranges = rules.normalizeDateRanges([
    { start: '2026-03-03', end: '2026-03-03' },
    { start: '2026-03-03', end: '2026-03-03' },
  ]);
  assert.deepEqual(ranges.map(range => ({ start: rules.formatCivilDate(range.start), end: rules.formatCivilDate(range.end) })), [{ start: '2026-03-03', end: '2026-03-03' }]);
});

test('partial-month and total-only unpaid leave require manual review and do not enter final results', () => {
  const partial = rules.calculateAnnualLeave(input({ unpaidRanges: [{ start: '2026-03-10', end: '2026-03-12' }] }));
  assert.equal(partial.statutory.determinate, false);
  assert.equal(partial.statutory.rounded, null);
  assert.equal(partial.contract.rounded, null);
  assert.match(partial.pending.join(' '), /MANUAL_REVIEW_REQUIRED/);
  const totalOnly = rules.calculateAnnualLeave(input({ unpaidTotalDays: 4 }));
  assert.equal(totalOnly.totalDeterminate, false);
  assert.equal(totalOnly.statutory.balance, null);
  assert.match(totalOnly.pending.join(' '), /Dates are required/);
});

test('used days above entitlement stay visible as a warning, not an inferred debt', () => {
  const result = rules.calculateAnnualLeave(input({ usedDays: 20 }));
  assert.equal(result.statutory.balance, -13);
  assert.equal(result.contract.balance, -6);
  assert.match(result.warnings.join(' '), /does not infer a debt/);
});

test('carry-forward and signed adjustments apply only to the contract ledger', () => {
  const result = rules.calculateAnnualLeave(input({ usedDays: 4, carriedDays: 2, adjustmentDays: -1 }));
  assert.equal(result.statutory.balance, 3);
  assert.equal(result.contract.balance, 11);
});

test('missing company policy keeps contract results pending without hiding a determinate statutory estimate', () => {
  const result = rules.calculateAnnualLeave(input({ contractProrationPolicy: '', contractEligibilityPolicy: '' }));
  assert.equal(result.errors.length, 0);
  assert.equal(result.statutory.rounded, 7);
  assert.equal(result.contract.rounded, null);
  assert.match(result.pending.join(' '), /company contract/i);
});

test('empty, negative, illegal and contradictory inputs are blocked', () => {
  assert.match(rules.calculateAnnualLeave(input({ hireDate: '' })).errors.join(' '), /required/);
  assert.match(rules.calculateAnnualLeave(input({ usedDays: '' })).errors.join(' '), /Used leave days is required/);
  assert.match(rules.calculateAnnualLeave(input({ contractAnnualDays: 0 })).errors.join(' '), /greater than zero/);
  assert.match(rules.calculateAnnualLeave(input({ contractAnnualDays: -1 })).errors.join(' '), /greater than zero/);
  assert.match(rules.calculateAnnualLeave(input({ usedDays: -1 })).errors.join(' '), /cannot be negative/);
  assert.match(rules.calculateAnnualLeave(input({ calculationDate: '2026-02-30' })).errors.join(' '), /valid calendar date/);
  assert.match(rules.calculateAnnualLeave(input({ calculationDate: '2025-12-31' })).errors.join(' '), /before employment start/);
  assert.match(rules.calculateAnnualLeave(input({ unpaidRanges: [{ start: '2026-04-02', end: '2026-04-01' }] })).errors.join(' '), /ends before/);
  assert.match(rules.calculateAnnualLeave(input({ unpaidTotalDays: 1, unpaidRanges: [{ start: '2026-04-01', end: '2026-04-01' }] })).errors.join(' '), /not both/);
});

test('leap-day anniversary and cross-year dates do not shift through local time', () => {
  const window = rules.leaveYearWindow({ leaveYearType: 'anniversary', leaveYearReference: '2025-08-01', hireDate: '2024-02-29' });
  assert.equal(rules.formatCivilDate(window.start), '2025-02-28');
  assert.equal(rules.formatCivilDate(window.end), '2026-02-27');
  const result = rules.calculateAnnualLeave(input({ hireDate: '2024-02-29', calculationDate: '2026-02-27', leaveYearType: 'anniversary', leaveYearReference: '2025-08-01' }));
  assert.equal(result.leaveYear.start, '2025-02-28');
  assert.equal(result.service.includedCompletedMonths, 12);
});
