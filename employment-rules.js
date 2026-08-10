(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.EmploymentRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

  function fail(message, code = 'INVALID_INPUT') {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function finiteNumber(value, label, options = {}) {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) fail(`${label} must be a number.`, 'INVALID_NUMBER');
    if (options.positive && number <= 0) fail(`${label} must be greater than zero.`, 'NON_POSITIVE');
    if (options.nonNegative && number < 0) fail(`${label} cannot be negative.`, 'NEGATIVE');
    if (options.integer && !Number.isInteger(number)) fail(`${label} must be a whole number.`, 'NON_INTEGER');
    return number;
  }

  function parseCivilDate(value, label = 'Date') {
    if (typeof value !== 'string' || !value) fail(`${label} is required.`, 'REQUIRED_DATE');
    const match = DATE_PATTERN.exec(value);
    if (!match) fail(`${label} must use YYYY-MM-DD.`, 'INVALID_DATE');
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const utc = new Date(Date.UTC(year, month - 1, day));
    if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
      fail(`${label} is not a valid calendar date.`, 'INVALID_DATE');
    }
    return { year, month, day };
  }

  function formatCivilDate(date) {
    return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  }

  function civilTime(date) {
    return Date.UTC(date.year, date.month - 1, date.day);
  }

  function compareCivilDates(left, right) {
    return Math.sign(civilTime(left) - civilTime(right));
  }

  function addCivilDays(date, days) {
    finiteNumber(days, 'Day adjustment', { integer: true });
    const value = new Date(civilTime(date) + days * 86400000);
    return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
  }

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function monthTarget(start, months) {
    const zeroBased = start.month - 1 + months;
    const year = start.year + Math.floor(zeroBased / 12);
    const monthIndex = ((zeroBased % 12) + 12) % 12;
    return { year, month: monthIndex + 1 };
  }

  function calendarNoticeEnd(startValue, amountValue, unit, options = {}) {
    const start = typeof startValue === 'string' ? parseCivilDate(startValue, 'Notice start date') : startValue;
    const amount = finiteNumber(amountValue, 'Notice length', { positive: true, integer: true });
    if (unit === 'days') {
      if (options.dayBasis !== 'calendar') fail('Choose Calendar days or provide a confirmed working-day calendar.', 'DAY_BASIS_REQUIRED');
      return addCivilDays(start, amount - 1);
    }
    if (unit === 'weeks') return addCivilDays(start, amount * 7 - 1);
    if (unit === 'months') {
      const target = monthTarget(start, amount);
      if (start.day <= daysInMonth(target.year, target.month)) {
        return addCivilDays({ year: target.year, month: target.month, day: start.day }, -1);
      }
      return { year: target.year, month: target.month, day: daysInMonth(target.year, target.month) };
    }
    fail('Notice unit must be days, weeks, or months.', 'INVALID_NOTICE_UNIT');
  }

  function workingNoticeEnd(effectiveDateValue, amountValue, includedDateValues) {
    const effective = typeof effectiveDateValue === 'string'
      ? parseCivilDate(effectiveDateValue, 'Confirmed working-day notice effective date')
      : effectiveDateValue;
    const amount = finiteNumber(amountValue, 'Notice length', { positive: true, integer: true });
    if (!Array.isArray(includedDateValues) || !includedDateValues.length) {
      fail('Provide the actual included working dates from the company calendar.', 'WORKING_CALENDAR_REQUIRED');
    }
    const dates = [...new Set(includedDateValues.map((value) => formatCivilDate(parseCivilDate(value, 'Included working date'))))]
      .map((value) => parseCivilDate(value))
      .sort(compareCivilDates)
      .filter((date) => compareCivilDates(date, effective) >= 0);
    if (!dates.length || compareCivilDates(dates[0], effective) !== 0) {
      fail('The confirmed effective date must be the first included working date.', 'EFFECTIVE_DATE_NOT_INCLUDED');
    }
    if (dates.length < amount) fail(`Provide at least ${amount} included working dates.`, 'INSUFFICIENT_WORKING_DATES');
    return dates[amount - 1];
  }

  function noticeEnd(input) {
    if (input.unit === 'days' && input.dayBasis === 'working') {
      return workingNoticeEnd(input.workingEffectiveDate, input.amount, input.includedWorkingDates);
    }
    return calendarNoticeEnd(input.submissionDate, input.amount, input.unit, { dayBasis: input.dayBasis || 'calendar' });
  }

  function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function addCivilMonths(date, monthsValue) {
    const months = finiteNumber(monthsValue, 'Month adjustment', { integer: true });
    const target = monthTarget(date, months);
    return { year: target.year, month: target.month, day: Math.min(date.day, daysInMonth(target.year, target.month)) };
  }

  function inclusiveDayCount(start, end) {
    return Math.floor((civilTime(end) - civilTime(start)) / 86400000) + 1;
  }

  function laterDate(left, right) {
    return compareCivilDates(left, right) >= 0 ? left : right;
  }

  function earlierDate(left, right) {
    return compareCivilDates(left, right) <= 0 ? left : right;
  }

  function roundLeaveDays(value) {
    const days = finiteNumber(value, 'Leave entitlement', { nonNegative: true });
    const whole = Math.floor(days);
    return days - whole < 0.5 ? whole : whole + 1;
  }

  function statutoryAnnualLeaveDays(serviceYearValue) {
    const serviceYear = finiteNumber(serviceYearValue, 'Service year', { positive: true, integer: true });
    return 7 + Math.min(serviceYear - 1, 7);
  }

  function serviceYearAt(hireDate, date) {
    if (compareCivilDates(date, hireDate) < 0) fail('Date cannot be before employment start.', 'DATE_BEFORE_HIRE');
    let completedYears = Math.max(0, date.year - hireDate.year);
    while (completedYears > 0 && compareCivilDates(addCivilMonths(hireDate, completedYears * 12), date) > 0) completedYears -= 1;
    while (compareCivilDates(addCivilMonths(hireDate, (completedYears + 1) * 12), date) <= 0) completedYears += 1;
    return completedYears + 1;
  }

  function leaveYearWindow(input) {
    const type = input.leaveYearType;
    if (!['calendar', 'anniversary', 'custom'].includes(type)) {
      fail('Choose Calendar year, Employment anniversary year, or Custom company leave year.', 'LEAVE_YEAR_REQUIRED');
    }
    const hireDate = typeof input.hireDate === 'string' ? parseCivilDate(input.hireDate, 'Employment start date') : input.hireDate;
    if (type === 'custom') {
      const start = typeof input.customLeaveYearStart === 'string'
        ? parseCivilDate(input.customLeaveYearStart, 'Custom company leave year start')
        : input.customLeaveYearStart;
      return { type, start, end: addCivilDays(addCivilMonths(start, 12), -1) };
    }
    const reference = typeof input.leaveYearReference === 'string'
      ? parseCivilDate(input.leaveYearReference, 'Leave year reference date')
      : input.leaveYearReference;
    if (type === 'calendar') {
      return {
        type,
        start: { year: reference.year, month: 1, day: 1 },
        end: { year: reference.year, month: 12, day: 31 },
      };
    }
    if (compareCivilDates(reference, hireDate) < 0) {
      fail('The anniversary leave year cannot be before employment started.', 'LEAVE_YEAR_BEFORE_HIRE');
    }
    const year = serviceYearAt(hireDate, reference);
    const start = addCivilMonths(hireDate, (year - 1) * 12);
    return { type, start, end: addCivilDays(addCivilMonths(start, 12), -1), serviceYear: year };
  }

  function normalizeDateRanges(rangeValues, label = 'Unpaid leave') {
    if (rangeValues === undefined || rangeValues === null) return [];
    if (!Array.isArray(rangeValues)) fail(`${label} periods must be a list.`, 'INVALID_DATE_RANGES');
    const ranges = [];
    rangeValues.forEach((range, index) => {
      const startValue = range && range.start;
      const endValue = range && range.end;
      if (!startValue && !endValue) return;
      if (!startValue || !endValue) fail(`${label} period ${index + 1} needs both a start and end date.`, 'INCOMPLETE_DATE_RANGE');
      const start = parseCivilDate(startValue, `${label} period ${index + 1} start`);
      const end = parseCivilDate(endValue, `${label} period ${index + 1} end`);
      if (compareCivilDates(end, start) < 0) fail(`${label} period ${index + 1} ends before it starts.`, 'DATE_RANGE_REVERSED');
      ranges.push({ start, end });
    });
    ranges.sort((left, right) => compareCivilDates(left.start, right.start) || compareCivilDates(left.end, right.end));
    return ranges.reduce((merged, range) => {
      const previous = merged[merged.length - 1];
      if (!previous || compareCivilDates(range.start, addCivilDays(previous.end, 1)) > 0) {
        merged.push({ start: range.start, end: range.end });
      } else if (compareCivilDates(range.end, previous.end) > 0) {
        previous.end = range.end;
      }
      return merged;
    }, []);
  }

  function rangeOverlap(range, start, end) {
    const overlapStart = laterDate(range.start, start);
    const overlapEnd = earlierDate(range.end, end);
    return compareCivilDates(overlapStart, overlapEnd) <= 0 ? { start: overlapStart, end: overlapEnd } : null;
  }

  function rangeCovered(start, end, ranges) {
    return ranges.some((range) => compareCivilDates(range.start, start) <= 0 && compareCivilDates(range.end, end) >= 0);
  }

  function rangeTouches(start, end, ranges) {
    return ranges.some((range) => rangeOverlap(range, start, end));
  }

  function recurringLeaveYearWindow(type, date, hireDate, customStart) {
    if (type === 'calendar') {
      return { start: { year: date.year, month: 1, day: 1 }, end: { year: date.year, month: 12, day: 31 } };
    }
    const anchor = type === 'anniversary' ? hireDate : customStart;
    let years = date.year - anchor.year;
    let start = addCivilMonths(anchor, years * 12);
    while (compareCivilDates(start, date) > 0) {
      years -= 1;
      start = addCivilMonths(anchor, years * 12);
    }
    let next = addCivilMonths(anchor, (years + 1) * 12);
    while (compareCivilDates(next, date) <= 0) {
      years += 1;
      start = next;
      next = addCivilMonths(anchor, (years + 1) * 12);
    }
    return { start, end: addCivilDays(next, -1) };
  }

  function splitRangesByLeaveYear(ranges, options) {
    const pieces = [];
    for (const range of ranges) {
      let cursor = range.start;
      while (compareCivilDates(cursor, range.end) <= 0) {
        const window = recurringLeaveYearWindow(options.leaveYearType, cursor, options.hireDate, options.customLeaveYearStart);
        const pieceEnd = earlierDate(range.end, window.end);
        pieces.push({
          leaveYearStart: formatCivilDate(window.start),
          leaveYearEnd: formatCivilDate(window.end),
          start: formatCivilDate(cursor),
          end: formatCivilDate(pieceEnd),
          days: inclusiveDayCount(cursor, pieceEnd),
        });
        cursor = addCivilDays(pieceEnd, 1);
      }
    }
    return pieces;
  }

  function calculateAnnualLeave(input) {
    const errors = [];
    const pending = [];
    const warnings = [];
    let hireDate;
    let calculationDate;
    let window;
    let normalizedRanges = [];

    try {
      hireDate = parseCivilDate(input.hireDate, 'Employment start date');
    } catch (error) {
      errors.push(error.message);
    }
    try {
      calculationDate = parseCivilDate(input.calculationDate, 'Calculation or employment end date');
    } catch (error) {
      errors.push(error.message);
    }
    if (hireDate && calculationDate && compareCivilDates(calculationDate, hireDate) < 0) {
      errors.push('Calculation or employment end date cannot be before employment start date.');
    }
    if (hireDate && calculationDate && calculationDate.year - hireDate.year > 150) {
      errors.push('Employment period is outside the supported range.');
    }
    if (hireDate) {
      try {
        window = leaveYearWindow({
          leaveYearType: input.leaveYearType,
          leaveYearReference: input.leaveYearReference,
          customLeaveYearStart: input.customLeaveYearStart,
          hireDate,
        });
      } catch (error) {
        errors.push(error.message);
      }
    }

    let usedDays;
    let carriedDays;
    let adjustmentDays;
    if (!valueProvided(input.usedDays)) errors.push('Used leave days is required; enter 0 if none.');
    else try {
        usedDays = finiteNumber(input.usedDays, 'Used leave days', { nonNegative: true });
      } catch (error) {
        errors.push(error.message);
      }
    if (!valueProvided(input.carriedDays)) errors.push('Carried-forward leave days is required; enter 0 if none.');
    else try {
        carriedDays = finiteNumber(input.carriedDays, 'Carried-forward leave days', { nonNegative: true });
      } catch (error) {
        errors.push(error.message);
      }
    if (!valueProvided(input.adjustmentDays)) errors.push('Manual adjustment days is required; enter 0 if none.');
    else try {
        adjustmentDays = finiteNumber(input.adjustmentDays, 'Manual adjustment days');
      } catch (error) {
        errors.push(error.message);
      }

    let unpaidTotalDays = 0;
    if (valueProvided(input.unpaidTotalDays)) {
      try {
        unpaidTotalDays = finiteNumber(input.unpaidTotalDays, 'Unpaid leave total days', { nonNegative: true });
      } catch (error) {
        errors.push(error.message);
      }
    }
    try {
      normalizedRanges = normalizeDateRanges(input.unpaidRanges || []);
    } catch (error) {
      errors.push(error.message);
    }
    if (unpaidTotalDays > 0 && normalizedRanges.length) {
      errors.push('Use dated unpaid-leave periods or a total-only figure, not both.');
    }
    if (hireDate && calculationDate) {
      for (const range of normalizedRanges) {
        if (compareCivilDates(range.start, hireDate) < 0 || compareCivilDates(range.end, calculationDate) > 0) {
          errors.push('Unpaid-leave dates must fall within the employment period being calculated.');
          break;
        }
      }
    }

    let contractAnnualDays = null;
    if (valueProvided(input.contractAnnualDays)) {
      try {
        contractAnnualDays = finiteNumber(input.contractAnnualDays, 'Company annual leave days', { positive: true });
        if (contractAnnualDays > 365) fail('Company annual leave days must not exceed 365.', 'OUT_OF_RANGE');
      } catch (error) {
        errors.push(error.message);
      }
    }

    if (errors.length || !hireDate || !calculationDate || !window) {
      return { errors, pending, warnings, totalDeterminate: false, statutory: null, contract: null, unpaidLeave: null, leaveYear: null };
    }

    if (compareCivilDates(calculationDate, window.start) < 0) {
      errors.push('Calculation date is before the selected leave year.');
      return { errors, pending, warnings, totalDeterminate: false, statutory: null, contract: null, unpaidLeave: null, leaveYear: null };
    }
    const activeStart = laterDate(hireDate, window.start);
    const activeEnd = earlierDate(calculationDate, window.end);
    if (compareCivilDates(activeEnd, activeStart) < 0) {
      errors.push('Employment does not overlap the selected leave year.');
      return { errors, pending, warnings, totalDeterminate: false, statutory: null, contract: null, unpaidLeave: null, leaveYear: null };
    }

    const relevantUnpaid = normalizedRanges.map((range) => rangeOverlap(range, activeStart, activeEnd)).filter(Boolean);
    const serviceMonths = [];
    for (let monthIndex = 0; monthIndex < 1800; monthIndex += 1) {
      const start = addCivilMonths(hireDate, monthIndex);
      const end = addCivilDays(addCivilMonths(hireDate, monthIndex + 1), -1);
      if (compareCivilDates(end, activeEnd) > 0) break;
      if (compareCivilDates(end, activeStart) < 0) continue;
      const fullyUnpaid = rangeCovered(start, end, relevantUnpaid);
      const partlyUnpaid = !fullyUnpaid && rangeTouches(start, end, relevantUnpaid);
      serviceMonths.push({
        index: monthIndex + 1,
        serviceYear: Math.floor(monthIndex / 12) + 1,
        start,
        end,
        fullyUnpaid,
        partlyUnpaid,
      });
    }

    const excludedMonths = serviceMonths.filter((month) => month.fullyUnpaid);
    const partialMonths = serviceMonths.filter((month) => month.partlyUnpaid);
    const includedMonths = serviceMonths.filter((month) => !month.fullyUnpaid);
    const statutoryBreakdownMap = new Map();
    includedMonths.forEach((month) => {
      const annualDays = statutoryAnnualLeaveDays(month.serviceYear);
      statutoryBreakdownMap.set(annualDays, (statutoryBreakdownMap.get(annualDays) || 0) + 1);
    });
    const statutoryBreakdown = [...statutoryBreakdownMap.entries()].map(([annualDays, months]) => ({ annualDays, months }));
    const statutoryRaw = statutoryBreakdown.reduce((sum, item) => sum + (item.months / 12) * item.annualDays, 0);
    const eligibilityDate = addCivilDays(addCivilMonths(hireDate, 3), -1);
    const statutoryEligible = compareCivilDates(calculationDate, eligibilityDate) >= 0;

    const sharedManualReasons = [];
    if (unpaidTotalDays > 0) {
      sharedManualReasons.push('Only a total number of unpaid-leave days was provided. Dates are required before completed service months can be adjusted.');
    }
    if (partialMonths.length) {
      sharedManualReasons.push('Unpaid leave touches a service month without fully covering it. HR must confirm the completed-month adjustment.');
    }
    sharedManualReasons.forEach((reason) => pending.push(`MANUAL_REVIEW_REQUIRED: ${reason}`));

    const statutoryDeterminate = sharedManualReasons.length === 0;
    const statutoryEntitlement = statutoryDeterminate ? (statutoryEligible ? roundLeaveDays(statutoryRaw) : 0) : null;
    const statutoryBalance = statutoryEntitlement === null ? null : statutoryEntitlement - usedDays;

    const contractReasons = [...sharedManualReasons];
    if (!valueProvided(input.contractAnnualDays)) contractReasons.push('Enter the annual leave days stated by the company contract.');
    if (input.contractProrationPolicy !== 'completed-months') {
      contractReasons.push('Confirm that the company contract uses completed service months ÷ 12 for pro-rating.');
    }
    if (!['after-three-months', 'from-start'].includes(input.contractEligibilityPolicy)) {
      contractReasons.push('Choose the company contract eligibility policy; no company default is assumed.');
    }
    contractReasons.filter((reason) => !sharedManualReasons.includes(reason)).forEach((reason) => pending.push(`MANUAL_REVIEW_REQUIRED: ${reason}`));
    const contractEligible = input.contractEligibilityPolicy === 'from-start' || statutoryEligible;
    const contractRaw = contractAnnualDays === null ? null : (includedMonths.length / 12) * contractAnnualDays;
    const contractDeterminate = contractReasons.length === 0 && contractRaw !== null;
    const contractEntitlement = contractDeterminate ? (contractEligible ? roundLeaveDays(contractRaw) : 0) : null;
    const contractBalance = contractEntitlement === null ? null : contractEntitlement + carriedDays + adjustmentDays - usedDays;

    if (statutoryBalance !== null && statutoryBalance < 0) {
      warnings.push('Used leave exceeds the statutory estimate. This calculator does not infer a debt or payroll deduction; check HR records.');
    }
    if (contractBalance !== null && contractBalance < 0) {
      warnings.push('Used leave exceeds the contract ledger estimate. Confirm any negative balance and treatment with HR.');
    }

    const uniqueUnpaidDays = relevantUnpaid.reduce((sum, range) => sum + inclusiveDayCount(range.start, range.end), 0);
    const customStart = input.leaveYearType === 'custom' ? window.start : null;
    const splitRanges = splitRangesByLeaveYear(normalizedRanges, {
      leaveYearType: input.leaveYearType,
      hireDate,
      customLeaveYearStart: customStart,
    });
    const currentServiceYear = serviceYearAt(hireDate, calculationDate);
    const nextTierDate = currentServiceYear < 8 ? addCivilMonths(hireDate, currentServiceYear * 12) : null;

    return {
      errors,
      pending: [...new Set(pending)],
      warnings: [...new Set(warnings)],
      totalDeterminate: statutoryDeterminate && contractDeterminate,
      leaveYear: {
        type: window.type,
        start: formatCivilDate(window.start),
        end: formatCivilDate(window.end),
        activeStart: formatCivilDate(activeStart),
        activeEnd: formatCivilDate(activeEnd),
      },
      service: {
        statutoryEligible,
        eligibilityDate: formatCivilDate(eligibilityDate),
        currentServiceYear,
        completedMonthsInLeaveYear: serviceMonths.length,
        includedCompletedMonths: includedMonths.length,
        excludedCompleteMonths: excludedMonths.length,
        nextTierDate: nextTierDate ? formatCivilDate(nextTierDate) : null,
      },
      statutory: {
        determinate: statutoryDeterminate,
        eligible: statutoryEligible,
        raw: statutoryRaw,
        rounded: statutoryEntitlement,
        balance: statutoryBalance,
        usedDays,
        breakdown: statutoryBreakdown,
      },
      contract: {
        determinate: contractDeterminate,
        eligible: contractEligible,
        annualDays: contractAnnualDays,
        raw: contractRaw,
        rounded: contractEntitlement,
        balance: contractBalance,
        usedDays,
        carriedDays,
        adjustmentDays,
      },
      unpaidLeave: {
        uniqueDays: uniqueUnpaidDays,
        totalOnlyDays: unpaidTotalDays,
        normalizedRanges: normalizedRanges.map((range) => ({ start: formatCivilDate(range.start), end: formatCivilDate(range.end) })),
        splitRanges,
        excludedCompleteMonths: excludedMonths.map((month) => ({ start: formatCivilDate(month.start), end: formatCivilDate(month.end) })),
        partialServiceMonths: partialMonths.map((month) => ({ start: formatCivilDate(month.start), end: formatCivilDate(month.end) })),
      },
    };
  }

  function grossDailyRate(monthlyGrossValue, weeklyWorkDaysValue) {
    const monthlyGross = finiteNumber(monthlyGrossValue, 'Monthly gross rate', { positive: true });
    const weeklyWorkDays = finiteNumber(weeklyWorkDaysValue, 'Required work days per week', { positive: true });
    if (![5, 6].includes(weeklyWorkDays)) {
      fail('Only fixed 5-day or 6-day schedules can be calculated automatically.', 'COMPLEX_SCHEDULE');
    }
    return (12 * monthlyGross) / (52 * weeklyWorkDays);
  }

  function incompleteMonthSalary(monthlyGrossValue, monthWorkDaysValue, payableDaysValue) {
    const monthlyGross = finiteNumber(monthlyGrossValue, 'Monthly gross rate', { positive: true });
    const monthWorkDays = finiteNumber(monthWorkDaysValue, 'Working days in the final salary month', { positive: true, integer: true });
    const payableDays = finiteNumber(payableDaysValue, 'Payable days in the final salary month', { nonNegative: true });
    if (payableDays > monthWorkDays) fail('Payable days cannot exceed working days in the final salary month.', 'PAYABLE_EXCEEDS_MONTH');
    return (monthlyGross / monthWorkDays) * payableDays;
  }

  function wholeMonthCount(start, end, maximum = 120) {
    for (let months = 1; months <= maximum; months += 1) {
      const candidate = calendarNoticeEnd(start, months, 'months');
      const comparison = compareCivilDates(candidate, end);
      if (comparison === 0) return months;
      if (comparison > 0) return months === 1 ? 0 : null;
    }
    return null;
  }

  function calculateNoticePay(input) {
    if (input.fulfilment === 'full' || input.fulfilment === 'waiver' || input.leaveTreatment === 'offset') {
      return { amount: 0, payer: null, recipient: null, method: 'none', pending: null };
    }
    if (!['partial', 'none'].includes(input.fulfilment)) {
      return { amount: null, payer: null, recipient: null, method: null, pending: 'Choose how much of the notice period will be served.' };
    }
    if (!['employer', 'employee'].includes(input.earlyTerminationInitiator)) {
      return { amount: null, payer: null, recipient: null, method: null, pending: 'Confirm which party decided to end service early.' };
    }
    const payer = input.earlyTerminationInitiator;
    const recipient = payer === 'employer' ? 'employee' : 'employer';
    const start = input.unservedStart;
    const end = input.contractualEnd;
    if (!start || compareCivilDates(start, end) > 0) {
      return { amount: 0, payer, recipient, method: 'none', pending: null };
    }
    const wholeMonths = wholeMonthCount(start, end);
    if (wholeMonths && wholeMonths > 0) {
      return {
        amount: Number(input.monthlyGross) * wholeMonths,
        payer,
        recipient,
        method: 'whole-month',
        wholeMonths,
        pending: null,
      };
    }
    if (wholeMonths === 0) {
      if (input.payableUnservedWorkDays === '' || input.payableUnservedWorkDays === null || input.payableUnservedWorkDays === undefined) {
        return { amount: null, payer, recipient, method: 'daily', pending: 'Enter the payroll-confirmed payable working days in the unserved period.' };
      }
      try {
        const days = finiteNumber(input.payableUnservedWorkDays, 'Payable unserved working days', { nonNegative: true });
        return {
          amount: grossDailyRate(input.monthlyGross, input.weeklyWorkDays) * days,
          payer,
          recipient,
          method: 'daily',
          payableWorkDays: days,
          pending: null,
        };
      } catch (error) {
        if (error.code === 'COMPLEX_SCHEDULE') {
          return { amount: null, payer, recipient, method: 'daily', pending: error.message };
        }
        return { amount: null, payer, recipient, method: 'daily', pending: null, error: error.message };
      }
    }
    return {
      amount: null,
      payer,
      recipient,
      method: null,
      pending: 'The unserved period exceeds one month but is not an exact whole-month interval. Payroll review is required.',
    };
  }

  function valueProvided(value) {
    return value !== '' && value !== null && value !== undefined;
  }

  function calculateSettlement(input) {
    const errors = [];
    const pending = [];
    let contractualEnd = null;
    let officialEnd = null;
    let attendanceDate = null;
    let noticePay = { amount: null, payer: null, recipient: null, method: null, pending: null };
    let earnedSalary = null;
    let leaveEncashment = null;
    let dailyRate = null;

    let monthlyGross;
    try {
      monthlyGross = finiteNumber(input.monthlyGross, 'Monthly gross rate', { positive: true });
    } catch (error) {
      errors.push(error.message);
    }

    let submissionDate;
    try {
      submissionDate = parseCivilDate(input.submissionDate, 'Notice submission date');
    } catch (error) {
      errors.push(error.message);
    }

    try {
      finiteNumber(input.noticeLength, 'Notice length', { positive: true, integer: true });
      if (!['days', 'weeks', 'months'].includes(input.noticeUnit)) fail('Choose a notice unit.', 'NOTICE_UNIT_REQUIRED');
      if (input.noticeUnit === 'days' && !['calendar', 'working'].includes(input.dayBasis)) {
        fail('Choose whether contract days are Calendar or Working days.', 'DAY_BASIS_REQUIRED');
      }
      if (input.noticeUnit === 'days' && input.dayBasis === 'working') {
        const effective = parseCivilDate(input.workingEffectiveDate, 'Confirmed working-day notice effective date');
        if (submissionDate && compareCivilDates(effective, submissionDate) < 0) {
          fail('The confirmed working-day effective date cannot be before submission.', 'EFFECTIVE_BEFORE_SUBMISSION');
        }
      }
      if (submissionDate) contractualEnd = noticeEnd({
        submissionDate: input.submissionDate,
        amount: input.noticeLength,
        unit: input.noticeUnit,
        dayBasis: input.dayBasis,
        workingEffectiveDate: input.workingEffectiveDate,
        includedWorkingDates: input.includedWorkingDates,
      });
    } catch (error) {
      errors.push(error.message);
    }

    if (!['full', 'partial', 'none', 'waiver'].includes(input.fulfilment)) {
      errors.push('Choose whether notice is fully served, partly served, not served, or waived in writing.');
    }

    if (contractualEnd && submissionDate) {
      if (input.leaveTreatment === 'offset') {
        if (input.fulfilment !== 'full') errors.push('Leave offset cannot be combined with partial or unserved notice.');
        if (!input.offsetConsent) errors.push('Written employer agreement is required for leave offset.');
        try {
          officialEnd = parseCivilDate(input.offsetOfficialEndDate, 'HR-confirmed official end date after leave offset');
          if (compareCivilDates(officialEnd, submissionDate) < 0 || compareCivilDates(officialEnd, contractualEnd) > 0) {
            errors.push('The offset official end date must be between submission and contractual end dates.');
          }
        } catch (error) {
          errors.push(error.message);
        }
      } else if (input.fulfilment === 'full') {
        officialEnd = contractualEnd;
      } else if (input.fulfilment === 'waiver') {
        try {
          officialEnd = parseCivilDate(input.agreedEndDate, 'Written-waiver agreed end date');
          if (compareCivilDates(officialEnd, submissionDate) < 0 || compareCivilDates(officialEnd, contractualEnd) > 0) {
            errors.push('The agreed end date must be between submission and contractual end dates.');
          }
        } catch (error) {
          errors.push(error.message);
        }
      } else if (input.fulfilment === 'partial') {
        try {
          officialEnd = parseCivilDate(input.servedThroughDate, 'Last notice date served');
          if (compareCivilDates(officialEnd, submissionDate) < 0 || compareCivilDates(officialEnd, contractualEnd) >= 0) {
            errors.push('A partial-service end date must be on/after submission and before the contractual end date.');
          }
        } catch (error) {
          errors.push(error.message);
        }
      } else if (input.fulfilment === 'none') {
        officialEnd = submissionDate;
      }
    }

    if (officialEnd && submissionDate) {
      if (input.attendanceStatus === 'same') {
        attendanceDate = officialEnd;
      } else if (input.attendanceStatus === 'confirmed') {
        try {
          attendanceDate = parseCivilDate(input.confirmedAttendanceDate, 'HR-confirmed last attendance date');
          if (compareCivilDates(attendanceDate, submissionDate) < 0 || compareCivilDates(attendanceDate, officialEnd) > 0) {
            errors.push('Last attendance must be between submission and official employment end dates.');
          }
        } catch (error) {
          errors.push(error.message);
        }
      } else {
        pending.push('Actual last scheduled attendance is not HR-confirmed.');
      }
    }

    if (monthlyGross && contractualEnd && officialEnd) {
      let unservedStart = null;
      if (input.fulfilment === 'none') unservedStart = submissionDate;
      if (input.fulfilment === 'partial') unservedStart = addCivilDays(officialEnd, 1);
      noticePay = calculateNoticePay({
        fulfilment: input.fulfilment,
        leaveTreatment: input.leaveTreatment,
        earlyTerminationInitiator: input.earlyTerminationInitiator,
        unservedStart,
        contractualEnd,
        monthlyGross,
        payableUnservedWorkDays: input.payableUnservedWorkDays,
        weeklyWorkDays: input.weeklyWorkDays,
      });
      if (noticePay.pending) pending.push(noticePay.pending);
      if (noticePay.error) errors.push(noticePay.error);
    }

    if (input.finalSalaryTreatment === 'incomplete') {
      if (!monthlyGross) {
        pending.push('Final incomplete-month salary cannot be calculated without monthly gross rate.');
      } else if (!valueProvided(input.finalMonthWorkDays) || !valueProvided(input.finalMonthPayableDays)) {
        pending.push('Enter payroll-confirmed final-month working days and payable days.');
      } else {
        try {
          earnedSalary = incompleteMonthSalary(monthlyGross, input.finalMonthWorkDays, input.finalMonthPayableDays);
        } catch (error) {
          errors.push(error.message);
        }
      }
    } else if (input.finalSalaryTreatment !== 'not-applicable') {
      pending.push('Confirm whether an incomplete final salary month must be calculated.');
    }

    if (input.leaveTreatment === 'encashment') {
      if (!valueProvided(input.cashEligibleLeaveDays)) {
        pending.push('Enter HR-confirmed cash-eligible leave days.');
      } else {
        try {
          const days = finiteNumber(input.cashEligibleLeaveDays, 'Cash-eligible leave days', { nonNegative: true });
          dailyRate = grossDailyRate(monthlyGross, input.weeklyWorkDays);
          leaveEncashment = dailyRate * days;
        } catch (error) {
          if (error.code === 'COMPLEX_SCHEDULE') pending.push(error.message);
          else errors.push(error.message);
        }
      }
    } else if (input.leaveTreatment === 'offset') {
      try {
        finiteNumber(input.offsetLeaveDays, 'Leave days used to offset notice', { positive: true });
      } catch (error) {
        errors.push(error.message);
      }
      leaveEncashment = 0;
    } else if (input.leaveTreatment === 'ordinary' || input.leaveTreatment === 'none') {
      leaveEncashment = 0;
    } else {
      pending.push('Choose how unused leave is handled; no leave default is assumed.');
    }

    const hasCpfLines = (earnedSalary || 0) > 0 || (leaveEncashment || 0) > 0;
    if (hasCpfLines && !['applicable', 'not-applicable', 'check'].includes(input.cpfTreatment)) {
      pending.push('Choose the CPF treatment for salary and leave encashment.');
    }

    const employerLines = [];
    const employeeLines = [];
    if (earnedSalary !== null) employerLines.push({ key: 'earnedSalary', label: 'Final incomplete-month salary', amount: roundMoney(earnedSalary) });
    if (leaveEncashment !== null) employerLines.push({ key: 'leaveEncashment', label: 'Confirmed leave encashment', amount: roundMoney(leaveEncashment) });
    if (noticePay.amount !== null && noticePay.amount > 0) {
      const line = { key: 'noticePay', label: 'Compensation in lieu of notice', amount: roundMoney(noticePay.amount) };
      if (noticePay.payer === 'employer') employerLines.push(line);
      if (noticePay.payer === 'employee') employeeLines.push(line);
    }
    const employerSubtotal = roundMoney(employerLines.reduce((sum, line) => sum + line.amount, 0));
    const employeeSubtotal = roundMoney(employeeLines.reduce((sum, line) => sum + line.amount, 0));
    const totalDeterminate = errors.length === 0 && pending.length === 0;

    return {
      errors,
      pending,
      dates: {
        contractualEnd: contractualEnd && formatCivilDate(contractualEnd),
        officialEnd: officialEnd && formatCivilDate(officialEnd),
        attendanceDate: attendanceDate && formatCivilDate(attendanceDate),
      },
      dailyRate: dailyRate === null ? null : roundMoney(dailyRate),
      noticePay: {
        ...noticePay,
        amount: noticePay.amount === null ? null : roundMoney(noticePay.amount),
      },
      employerLines,
      employeeLines,
      employerSubtotal: totalDeterminate ? employerSubtotal : null,
      employeeSubtotal: totalDeterminate ? employeeSubtotal : null,
      knownEmployerItems: employerSubtotal,
      knownEmployeeItems: employeeSubtotal,
      totalDeterminate,
      cpf: {
        earnedSalary: earnedSalary === null ? null : input.cpfTreatment || 'check',
        leaveEncashment: leaveEncashment === null ? null : input.cpfTreatment || 'check',
        noticePay: noticePay.amount && noticePay.amount > 0 ? 'not-applicable' : null,
      },
    };
  }

  return Object.freeze({
    addCivilDays,
    addCivilMonths,
    calculateAnnualLeave,
    calculateNoticePay,
    calculateSettlement,
    calendarNoticeEnd,
    compareCivilDates,
    formatCivilDate,
    grossDailyRate,
    incompleteMonthSalary,
    noticeEnd,
    parseCivilDate,
    leaveYearWindow,
    normalizeDateRanges,
    roundMoney,
    roundLeaveDays,
    splitRangesByLeaveYear,
    statutoryAnnualLeaveDays,
    wholeMonthCount,
    workingNoticeEnd,
  });
});
