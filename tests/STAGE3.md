# Stage 3 resignation-calculator implementation baseline

The Stage 3 upgrade is implemented only at `resignation-calculator.html` and
uses `employment-rules.js` as the single calculation source. It does not add a
calculator URL, Annual Leave Calculator, foreigner income-tax calculator, PR,
deployment configuration, or production dependency.

## Frozen calculation mapping

| Rule | Implementation | Official source category |
| --- | --- | --- |
| Notice submission day is day 1 | Calendar days: `start + (N - 1)`; weeks: `start + (7N - 1)` | MOM termination with notice; Employment Act section 10 |
| Month notice anchor | If the target month has the original day, use that day minus one; otherwise use target month-end | Civil-date implementation of frozen MOM examples |
| Working-day notice | Requires an HR-confirmed effective date and explicit included company-calendar dates | Company-policy input; no hidden calendar/schedule default |
| Whole-month notice pay | `monthly gross × whole unserved months` | Employment Act section 11 |
| Short partial notice pay | `12 × monthly gross ÷ (52 × required weekly workdays) × payroll-confirmed payable workdays` | MOM monthly and daily salary guidance |
| Incomplete final-month salary | `monthly gross ÷ final-month working days × payable days` | MOM monthly and daily salary guidance |
| Leave encashment | `gross daily rate × HR-confirmed cash-eligible leave days` | MOM monthly and daily salary guidance |
| Money display | Retain internal precision, round each payment line to S$0.01, sum displayed lines | Product technical rule, not represented as a legal rounding rule |
| CPF labels | Notice pay: not payable; salary/leave: selected applicable, not applicable, or check required | CPF Board notice-pay and leave-encashment guidance |

Employer-payable and employee-payable items are never automatically netted.
Any invalid, contradictory, manual-review, or missing-policy condition hides
both subtotals and appears in the input-error or excluded-pending list.

## Automated checks

Run deterministic and static tests:

```sh
node --test tests/*.test.mjs
```

Run real-browser checks when a Playwright Chromium binary is available:

```sh
node tests/resignation-browser.mjs
```

The browser script covers desktop and 390px mobile layouts, both notice-pay
directions, full/partial notice, month-end and leap-day dates, leave offset,
pending total suppression, invalid input, keyboard reset, labels, overflow,
console errors, and screenshots. The script is dependency-free at runtime;
Playwright is needed only for the test runner.
