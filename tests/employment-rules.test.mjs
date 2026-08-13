import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const rules = require('../employment-rules.js');

const date = (value) => rules.formatCivilDate(value);

function baseInput(overrides = {}) {
  return {
    monthlyGross: 5200,
    submissionDate: '2026-08-03',
    noticeLength: 1,
    noticeUnit: 'months',
    dayBasis: '',
    workingEffectiveDate: '',
    includedWorkingDates: [],
    fulfilment: 'full',
    earlyTerminationInitiator: '',
    servedThroughDate: '',
    agreedEndDate: '',
    payableUnservedWorkDays: '',
    weeklyWorkDays: 5,
    finalSalaryTreatment: 'incomplete',
    finalMonthWorkDays: 21,
    finalMonthPayableDays: 2,
    leaveTreatment: 'encashment',
    cashEligibleLeaveDays: 2,
    offsetLeaveDays: '',
    offsetConsent: false,
    offsetOfficialEndDate: '',
    attendanceStatus: 'same',
    confirmedAttendanceDate: '',
    cpfTreatment: 'applicable',
    ...overrides,
  };
}

test('calendar notice days include the submission date, weekends and public holidays', () => {
  assert.equal(date(rules.calendarNoticeEnd('2026-08-07', 4, 'days', { dayBasis: 'calendar' })), '2026-08-10');
  assert.equal(date(rules.calendarNoticeEnd('2026-12-24', 3, 'days', { dayBasis: 'calendar' })), '2026-12-26');
});

test('week notice uses consecutive seven-day periods', () => {
  assert.equal(date(rules.calendarNoticeEnd('2026-08-03', 1, 'weeks')), '2026-08-09');
  assert.equal(date(rules.calendarNoticeEnd('2026-08-03', 2, 'weeks')), '2026-08-16');
});

test('month notice preserves the original anchor with frozen month-end behavior', () => {
  assert.equal(date(rules.calendarNoticeEnd('2026-01-31', 1, 'months')), '2026-02-28');
  assert.equal(date(rules.calendarNoticeEnd('2025-01-31', 1, 'months')), '2025-02-28');
  assert.equal(date(rules.calendarNoticeEnd('2026-02-28', 1, 'months')), '2026-03-27');
  assert.equal(date(rules.calendarNoticeEnd('2024-02-29', 1, 'months')), '2024-03-28');
  assert.equal(date(rules.calendarNoticeEnd('2026-12-15', 2, 'months')), '2027-02-14');
});

test('working-day notice only uses explicit included dates and confirmed effective date', () => {
  const included = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-10'];
  assert.equal(date(rules.workingNoticeEnd('2026-08-03', 6, included)), '2026-08-10');
  assert.throws(() => rules.workingNoticeEnd('2026-08-02', 2, included), /first included working date/);
  assert.throws(() => rules.workingNoticeEnd('2026-08-03', 7, included), /at least 7/);

  const beforeSubmission = rules.calculateSettlement(baseInput({
    noticeUnit: 'days', noticeLength: 2, dayBasis: 'working',
    submissionDate: '2026-08-03', workingEffectiveDate: '2026-08-02',
    includedWorkingDates: ['2026-08-02', '2026-08-03'],
  }));
  assert.ok(beforeSubmission.errors.some((message) => /cannot be before submission/.test(message)));
});

test('gross daily rate and incomplete final-month salary use separate frozen formulas', () => {
  assert.equal(rules.roundMoney(rules.grossDailyRate(5200, 5)), 240);
  assert.equal(rules.roundMoney(rules.grossDailyRate(5200, 6)), 200);
  assert.equal(rules.roundMoney(rules.incompleteMonthSalary(5200, 20, 7)), 1820);
  assert.throws(() => rules.incompleteMonthSalary(5200, 20, 21), /cannot exceed/);
});

test('full notice creates no notice-pay direction or amount', () => {
  const result = rules.calculateSettlement(baseInput());
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.pending, []);
  assert.equal(result.noticePay.amount, 0);
  assert.equal(result.noticePay.payer, null);
  assert.equal(result.dates.contractualEnd, '2026-09-02');
  assert.equal(result.dates.officialEnd, '2026-09-02');
  assert.equal(result.totalDeterminate, true);
});

test('partial notice makes the party choosing early termination the payer', () => {
  const employerEnds = rules.calculateSettlement(baseInput({
    fulfilment: 'partial',
    servedThroughDate: '2026-08-21',
    earlyTerminationInitiator: 'employer',
    payableUnservedWorkDays: 8,
  }));
  assert.deepEqual(employerEnds.errors, []);
  assert.equal(employerEnds.noticePay.payer, 'employer');
  assert.equal(employerEnds.noticePay.recipient, 'employee');
  assert.equal(employerEnds.noticePay.amount, 1920);
  assert.ok(employerEnds.employerLines.some((line) => line.key === 'noticePay'));

  const employeeEnds = rules.calculateSettlement(baseInput({
    fulfilment: 'partial',
    servedThroughDate: '2026-08-21',
    earlyTerminationInitiator: 'employee',
    payableUnservedWorkDays: 8,
  }));
  assert.deepEqual(employeeEnds.errors, []);
  assert.equal(employeeEnds.noticePay.payer, 'employee');
  assert.equal(employeeEnds.noticePay.recipient, 'employer');
  assert.equal(employeeEnds.noticePay.amount, 1920);
  assert.ok(employeeEnds.employeeLines.some((line) => line.key === 'noticePay'));
});

test('a completely unserved exact whole-month notice uses monthly gross', () => {
  const result = rules.calculateSettlement(baseInput({
    fulfilment: 'none',
    earlyTerminationInitiator: 'employee',
  }));
  assert.deepEqual(result.errors, []);
  assert.equal(result.noticePay.method, 'whole-month');
  assert.equal(result.noticePay.amount, 5200);
  assert.equal(result.noticePay.payer, 'employee');
});

test('written leave offset changes official end only with consent and never adds encashment', () => {
  const result = rules.calculateSettlement(baseInput({
    leaveTreatment: 'offset',
    cashEligibleLeaveDays: 10,
    offsetLeaveDays: 3,
    offsetConsent: true,
    offsetOfficialEndDate: '2026-08-28',
  }));
  assert.deepEqual(result.errors, []);
  assert.equal(result.dates.contractualEnd, '2026-09-02');
  assert.equal(result.dates.officialEnd, '2026-08-28');
  assert.equal(result.noticePay.amount, 0);
  assert.equal(result.employerLines.find((line) => line.key === 'leaveEncashment').amount, 0);
});

test('ordinary leave during notice neither shortens employment nor creates encashment', () => {
  const result = rules.calculateSettlement(baseInput({ leaveTreatment: 'ordinary' }));
  assert.deepEqual(result.errors, []);
  assert.equal(result.dates.contractualEnd, '2026-09-02');
  assert.equal(result.dates.officialEnd, '2026-09-02');
  assert.equal(result.employerLines.find((line) => line.key === 'leaveEncashment').amount, 0);
});

test('leave encashment uses only confirmed cash-eligible days', () => {
  const result = rules.calculateSettlement(baseInput({ cashEligibleLeaveDays: 3.5 }));
  const line = result.employerLines.find((item) => item.key === 'leaveEncashment');
  assert.equal(result.dailyRate, 240);
  assert.equal(line.amount, 840);
});

test('unresolved policy and amounts never enter deterministic totals', () => {
  const result = rules.calculateSettlement(baseInput({
    noticeUnit: 'days',
    noticeLength: 30,
    dayBasis: '',
    finalSalaryTreatment: '',
    leaveTreatment: '',
    attendanceStatus: '',
    cpfTreatment: '',
  }));
  assert.ok(result.errors.some((message) => /Calendar or Working/.test(message)));
  assert.ok(result.pending.length >= 2);
  assert.equal(result.totalDeterminate, false);
  assert.equal(result.employerSubtotal, null);
  assert.equal(result.employeeSubtotal, null);
});

test('complex schedules and ambiguous long notice remainders require manual review', () => {
  const complexSchedule = rules.calculateSettlement(baseInput({
    fulfilment: 'partial',
    servedThroughDate: '2026-08-21',
    earlyTerminationInitiator: 'employee',
    payableUnservedWorkDays: 8,
    weeklyWorkDays: 5.5,
  }));
  assert.ok(complexSchedule.pending.some((message) => /fixed 5-day or 6-day/.test(message)));
  assert.equal(complexSchedule.totalDeterminate, false);

  const complexRemainder = rules.calculateSettlement(baseInput({
    noticeLength: 3,
    fulfilment: 'partial',
    servedThroughDate: '2026-08-20',
    earlyTerminationInitiator: 'employer',
    payableUnservedWorkDays: 50,
  }));
  assert.ok(complexRemainder.pending.some((message) => /exceeds one month/.test(message)));
  assert.equal(complexRemainder.noticePay.amount, null);
});

test('zero, empty, negative and illegal inputs are rejected', () => {
  assert.throws(() => rules.calendarNoticeEnd('2026-08-03', 0, 'days', { dayBasis: 'calendar' }), /greater than zero/);
  assert.throws(() => rules.calendarNoticeEnd('2026-08-03', -1, 'weeks'), /greater than zero/);
  assert.throws(() => rules.parseCivilDate('2026-02-30'), /valid calendar date/);
  assert.throws(() => rules.parseCivilDate(''), /required/);
  assert.throws(() => rules.grossDailyRate(-100, 5), /greater than zero/);

  const result = rules.calculateSettlement(baseInput({
    monthlyGross: '',
    noticeLength: 0,
    submissionDate: 'not-a-date',
  }));
  assert.ok(result.errors.length >= 3);
  assert.equal(result.totalDeterminate, false);
});

test('contradictory dates and leave choices are blocked', () => {
  const partialAfterEnd = rules.calculateSettlement(baseInput({
    fulfilment: 'partial',
    servedThroughDate: '2026-09-05',
    earlyTerminationInitiator: 'employee',
  }));
  assert.ok(partialAfterEnd.errors.some((message) => /before the contractual end/.test(message)));

  const partialBeforeStart = rules.calculateSettlement(baseInput({
    fulfilment: 'partial',
    servedThroughDate: '2026-08-01',
    earlyTerminationInitiator: 'employee',
  }));
  assert.ok(partialBeforeStart.errors.some((message) => /on\/after submission/.test(message)));

  const offsetAndPartial = rules.calculateSettlement(baseInput({
    fulfilment: 'partial',
    servedThroughDate: '2026-08-20',
    earlyTerminationInitiator: 'employee',
    leaveTreatment: 'offset',
    offsetConsent: true,
    offsetOfficialEndDate: '2026-08-28',
  }));
  assert.ok(offsetAndPartial.errors.some((message) => /cannot be combined/.test(message)));
  assert.equal(offsetAndPartial.totalDeterminate, false);
});
