---
name: verify-tests
description: Run the Taskly backend and frontend test suites and coverage with the exact allowed commands, interpret failures, and iterate within a fixed budget. Use after writing or updating tests, before reporting.
---

# Verify tests

Run only these commands (anything else is not permitted in this environment). Dependencies are already installed; do not run `npm install`. Never use `npx`, `npm exec` or `vitest` directly: they are not permitted and will be refused. If an allowed command is refused, do not try variations: say so in the report.

| Purpose | Command |
|---|---|
| One backend file | `npm --prefix backend test -- tests/router.test.ts` |
| Backend suite + coverage | `npm --prefix backend run test:coverage` |
| Backend types | `npm --prefix backend run typecheck` |
| One frontend file | `npm --prefix frontend test -- src/path/File.test.tsx` |
| Frontend suite + coverage | `npm --prefix frontend run test:coverage` |
| Frontend types | `npm --prefix frontend run typecheck` |

## Loop

1. Run the narrowest test file you changed. Read the failure fully before changing anything.
2. Decide the cause:
   - **My test is wrong** (wrong mock, selector, import path, async handling): fix the test.
   - **Production code is wrong** (the test states correct, intended behaviour): do **not** change code or bend the assertion. Remove that case from the test file, and record it under *Findings* with file, behaviour expected, behaviour observed.
   - **Pre-existing failure unrelated to your tests**: leave it, record it.
3. Re-run. Maximum **3** iterations per test file. Then stop and report what is unresolved.
4. When files pass, run the full suite plus coverage for each package you touched, and the typecheck (your test files must type-check).
5. Note the totals: tests passed/failed, and the coverage summary (statements, branches, functions, lines) before your change (from the first run if you ran it before editing) and after.

## Honesty rules

- Report the real numbers from the real output. If something did not run, say so.
- Never use `--passWithNoTests`, `-u` (snapshot update), coverage exclusions, or lowered thresholds.
- Flaky result (passes on rerun without changes) must be reported as flaky, not as green.
