# Stage 2 legacy-tool baseline

This baseline was captured from `main` commit
`24af17a6130a45aaa93193be1a665d8c4a157f34` before the employment and leave
expansion. It records the existing behavior; it does not endorse the existing
copy or calculations as the future legal or product implementation.

Run the baseline checks with:

```sh
node --test tests/baseline-pages.test.mjs
```

The test scaffold is not referenced by any production HTML page and has no
runtime or deployment dependency.

## Existing tool contracts

| Tool | Existing inputs and calculation behavior | Existing browser behavior |
| --- | --- | --- |
| Salary calculator | Basic salary, employee type, age band, weekly hours, and 1.5x/2x overtime hours. OT hourly rate is `12 × capped OT salary ÷ (52 × weekly hours)` with S$2,600/S$4,500 OT caps. Gross is basic plus OT; CPF uses the page's age rates and an S$8,000 monthly ceiling; net is gross less employee CPF. | Saves salary inputs and up to four history rows. Supports copy, TXT export, sharing, print styling, theme, and MYR/CNY reference conversion. |
| Resignation calculator | Monthly gross rate, 5/5.5/6 workdays, unused leave, resignation date, and calendar-day notice. Daily rate is `12 × monthly gross ÷ (52 × workdays)`. Leave cash is daily rate times leave days. Existing last-day logic counts the notice date as day one and subtracts simplified working days for the displayed physical date. | Saves the gross input and up to four history rows. Supports copy, TXT export, sharing, print styling, theme, and presets. This is the pre-expansion behavior that later stages are expected to replace deliberately. |
| Offer comparison | Two offers with salary, allowance, AWS, bonus, benefits, hours, commute, leave, and work costs. Computes annual cash, CPF-applicable wages using S$8,000 OW and S$102,000 total wage ceilings, employee/employer CPF, cash after costs, employer package, annual time, and effective hourly value. | Produces a comparison table and verdict, supports copy/reset and presets, and does not store comparison history. |
| Job-switch calculator | Current/new job cash, CPF, benefits, time, leave, qualitative scores, notice assumptions, gap days, buyout, and one-time cost. Computes annual value, effective hourly value, switching cost, break-even time, weighted scores, and a threshold-based verdict. | Saves up to five summary rows under `sg_job_switch_history_v1`. Supports copy, TXT export, reset, presets, and theme. |

## Stage 2 scope guards

- No existing tool HTML file is changed by this baseline commit.
- No Annual Leave Calculator or foreigner income-tax calculator is created.
- The frozen prohibited URLs remain absent.
- The formal handoff files remain outside the repository and must not be
  staged or committed.
