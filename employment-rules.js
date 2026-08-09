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
    calculateNoticePay,
    calculateSettlement,
    calendarNoticeEnd,
    compareCivilDates,
    formatCivilDate,
    grossDailyRate,
    incompleteMonthSalary,
    noticeEnd,
    parseCivilDate,
    roundMoney,
    wholeMonthCount,
    workingNoticeEnd,
  });
});
