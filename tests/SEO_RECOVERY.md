# SEO recovery verification — 7 November 2026

Branch: `seo/sgsp-index-recovery-2026-11`. Base: `6959089aaed13efc894d210099c3d72ca4d9671f`.

Run all Node test files with `node --test tests/*.test.mjs` (expand the paths explicitly in PowerShell). Where child-process isolation is unavailable, use `--test-isolation=none` with a supported Node version. The new tests independently reconcile salary, offer and switching estimates and verify all 21 existing canonical pages.

Serve the repository as static files for browser checks. The existing annual-leave and resignation browser scripts use Playwright and accept their documented URL and evidence-directory environment variables. Check desktop, 390px and 360px mobile layouts, invalid inputs, result clearing and resets. Browser tests require Playwright and a Chrome/Chromium executable.

The salary/offer/switch CPF model is a full-rate percentage planning estimate, before statutory monthly CPF rounding. Full-CPF scenarios with regular monthly wages at or below S$750 are rejected. Graduated PR rates, exact low-wage payroll, partial-year annual compensation, foreigner income tax and non-standard legal cases are outside this model. Salary overtime inputs can model assumptions; a result does not establish Part IV eligibility. The existing financial formula bodies are frozen separately from new input guards.

Official CPF reference: https://www.cpf.gov.sg/content/dam/web/employer/employer-obligations/documents/CPFcontributionratesfrom1Jan2026.pdf

MOM reference: https://www.mom.gov.sg/employment-practices/hours-of-work-overtime-and-rest-days

Do not request indexing for these branch changes until the reviewed commit is present in production. Preview verification, production release and Google indexing are separate outcomes.
