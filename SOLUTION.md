# SOLUTION: PR test agent

A GitHub Actions workflow that, for every pull request, runs a custom Claude Code agent with reusable skills. The agent analyses the diff, adds or updates unit tests (backend and frontend) only where warranted, and runs them. Separate, non-AI code then validates and re-runs everything independently, commits verified tests to the PR branch, and posts the results as a PR comment.

## 1. Main technical decisions

| Decision | Rationale |
|---|---|
| **Claude Code Action** as the agent environment | Native support for custom agents (`.claude/agents`) and skills (`.claude/skills`) in the repo, so the agent definition is versioned and reviewed like code. |
| **Three jobs with different trust levels** (`scope` → `agent` → `publish`) | The job that runs the model holds no write credentials. The job that can write holds no model and no secrets other than the repo token. A prompt-injected agent therefore cannot push, comment or change workflows. |
| **Agent returns a patch, not commits** | The agent only edits its local checkout. A deterministic script decides what is allowed (the "safe outputs" pattern). |
| **Code-based guard instead of trusting the prompt** | `guard-patch.mjs` rejects any file outside `backend/tests/**` and `frontend/src/**/*.test.ts(x)`, deletions, renames, mode changes, binaries, `.skip/.only/.todo`, `@ts-ignore`, `eslint-disable`, child processes, `.env` references, patches that remove more assertions or test cases than they add, and oversized patches. |
| **Independent verification** | `publish` re-runs both suites with coverage before and after applying the patch. It commits only if tests pass, test count does not drop and line/branch coverage does not fall. The agent's own claims are never trusted. |
| **Judging scripts come from the base branch** | `publish` checks out `.github/scripts` from the PR's base commit, so a PR cannot rewrite the code that judges it. |
| **Untrusted-input handling** | The PR title, body and comments are never given to the model; the prompt contains only the PR number, base SHA and scope flags. Agent output (report, test logs) is escaped before it is posted. |
| **Least privilege and limits** | `permissions: {}` by default; per-job minimum; tool allowlist (file tools plus `git diff/status/ls-files` and the npm test/typecheck scripts); no web tools; `--max-turns 30`; job `timeout-minutes`; `concurrency` with cancel-in-progress; actions pinned to commit SHAs; `npm ci --ignore-scripts` in jobs that handle the token; same-repo, non-draft, non-Dependabot PRs only. |
| **Change detection before spending tokens** | `scope` mirrors the coverage excludes (types, stories, design system, tests), so doc-only or type-only PRs never start the agent. |

## 2. How to run it and prerequisites

**Prerequisites**
1. Repository secret `CLAUDE_CODE_OAUTH_TOKEN` (create it with `claude setup-token`). An `ANTHROPIC_API_KEY` works too: change the `claude_code_oauth_token` input to `anthropic_api_key`.
2. The workflow and `.github/scripts/` must exist on the PR's **base branch** (`main`), because the judging scripts are loaded from there.
3. Settings → Actions: default workflow permissions can stay read-only (jobs request what they need); approval for outside contributors recommended.

**Run it**: open a PR from a branch in this repository into `main` that changes files under `backend/src` or `frontend/src`. The workflow starts automatically on `opened`, `synchronize`, `reopened` and `ready_for_review`. Watch it under Actions → "PR test agent"; the result is a single, updated comment on the PR. If the agent adds tests, they arrive as a `test:` commit from `github-actions[bot]`: `git pull` before pushing again.

**Local equivalents**: `npm --prefix backend run test:coverage`, `npm --prefix frontend run test:coverage`.

## 3. Where the agent and skills are defined

| What | Where | Used when |
|---|---|---|
| Workflow | `.github/workflows/pr-test-agent.yml` | Trigger, jobs, permissions, tool allowlist |
| Custom agent | `.claude/agents/pr-test-agent.md` | Started by the workflow with `--agent pr-test-agent`; holds the role, trust model, hard rules and procedure |
| Skill `analyze-pr-changes` | `.claude/skills/analyze-pr-changes/` | Step 1: diff analysis and a per-file "tests needed?" decision table |
| Skill `backend-unit-tests` | `.claude/skills/backend-unit-tests/` | Step 2 for `backend/src`: Vitest + Supertest, mocked Prisma delegate, shared fixtures |
| Skill `frontend-unit-tests` | `.claude/skills/frontend-unit-tests/` | Step 2 for `frontend/src`: Vitest + React Testing Library, mocked design system |
| Skill `verify-tests` | `.claude/skills/verify-tests/` | Step 3: allowed commands, bounded fix loop (3 iterations per file), honesty rules |
| Skill `write-pr-report` | `.claude/skills/write-pr-report/` | Step 4: fixed report format written to `.agent/report.md` |
| Patch guard | `.github/scripts/guard-patch.mjs` | `publish`: validates and applies the agent patch |
| Test runner / report | `.github/scripts/run-tests.sh`, `report.mjs` | `publish`: before/after runs, verdict, PR comment |

The agent decides *what* to test (policy); skills hold *how* (repo conventions) so they can be reused and improved independently; the workflow and scripts decide *what is allowed* (enforcement).

## 4. Example run

Example PR: [#1 "feat: add task summary endpoint and summary bar"](https://github.com/Ninottt9/cloudfide-task/pull/1). It adds production code only: `GET /api/todos/summary` and `summarizeTodos` (backend), and a `summarizeTodos` helper plus a `TodoSummary` component (frontend). It contains no tests.

**Agent decisions** (from its report)
- `backend/src/features/todos/summary.ts` and the `/summary` route: tests needed. New `backend/tests/summary.test.ts` (empty list, counts, by-priority, overdue boundary table). `router.test.ts` gained a route test with a faked date and an assertion that `/summary` is not routed to `/:id`.
- `frontend/.../utils/todos.ts` `summarizeTodos`: cases added to the existing `todos.test.ts`. New `TodoSummary.test.tsx` covers empty, counts, and overdue shown/hidden.
- `backend/openapi.json` and type-only changes: no tests needed.
- Findings reported rather than "fixed": `TodosPage.tsx` imported `TodoSummary` but never rendered it (a real bug in the PR, since fixed in a follow-up commit), and the backend counts overdue by UTC date while the frontend uses the local date.

**Skills used**: `analyze-pr-changes` → `backend-unit-tests` / `frontend-unit-tests` → `verify-tests` → `write-pr-report`.

**Independent verification** ([run](https://github.com/Ninottt9/cloudfide-task/actions/runs/38317314338))

| Package | Tests before → after | Statements | Branches | Functions | Lines |
|---|---|---|---|---|---|
| backend | 48 → 56 passed | 28.36% → 36.17% | 29.62% → 40.74% | 38.23% → 44.11% | 30.83% → 39.16% |
| frontend | 18 → 23 passed | 44.57% → 50.28% | 42.55% → 47.51% | 38.27% → 44.44% | 45.85% → 51.59% |

The guard accepted 4 files (+88/-1 lines) and the workflow committed them to the branch as `test: add and update unit tests (PR test agent)`.

**Second run on the same PR** ([run](https://github.com/Ninottt9/cloudfide-task/actions/runs/38326046354)): after the follow-up commit that wired `TodoSummary` into the page, the workflow ran again. The agent decided **no test changes were needed**: every changed behaviour already had tests (`summary.test.ts`, the route test in `router.test.ts`, `todos.test.ts`, `TodoSummary.test.tsx`), and `TodosPage` only mounts the component. The workflow's own re-run confirmed 56/56 backend and 23/23 frontend tests with unchanged coverage, and nothing was committed. This shows the agent is idempotent and does not pad tests on a re-run. The agent also reported honestly that it could not run the suites itself (it tried `npx vitest`, which is not allowlisted) and named the independent run as the authority; the skill now forbids `npx`.

**What went wrong first, and what it taught**
- The first run was **correctly blocked by my own guard**, which wrongly flagged the Prisma property `database.todo` as a skipped test (`.todo`). The check went red as designed; the regex was narrowed to Vitest modifiers chained on `it/test/describe`. The independent layer caught a defect in the independent layer's own rule.
- In the run above the agent could not run `test:coverage` because the tool allowlist pattern did not match it. It said so in its report instead of inventing numbers; the workflow's own verification supplied the figures. The allowlist was then corrected.

## 5. Assumptions

- Pull requests come from branches in this repository (collaborators with write access are trusted to change the workflow itself; the judging scripts are still pulled from the base branch).
- Tests are unit tests that need no real database: the repository layer mocks the Prisma delegate, as the existing tests do.
- Vitest is the only runner; coverage thresholds in the existing configs are kept and the agent may not edit them.
- A passing run means "tests pass, test count did not fall, line and branch coverage did not drop", not "the tests are good".

## 6. Limitations

- **Commits by `GITHUB_TOKEN` do not trigger workflows**, so the agent's commit gets no CI check of its own and the PR head can show zero checks; verification is the `publish` job on the previous commit. This also prevents loops.
- **No evaluation of test quality** beyond execution and coverage. Generated tests can still be shallow or assert the current behaviour of a bug. Mutation testing is not run.
- **Non-deterministic**: the same PR can produce different tests. One local run showed a cold-start flaky timeout in unrelated frontend tests; the workflow reports test results as-is and does not retry.
- **Same-repo PRs only**; fork PRs are skipped by design.
- **Prompt injection is mitigated, not eliminated**: the model sees diff content. Defence is least privilege, no secrets in context, a tool allowlist, a post-hoc path/content guard and escaping of output. GitHub-hosted runners have open network egress.
- **Authentication uses a personal subscription token** (`CLAUDE_CODE_OAUTH_TOKEN`), sharing limits with interactive use.
- Tool-permission pattern semantics are version-dependent; the guard is the control that does not depend on them.
- Large PRs are limited by `--max-turns` and the patch-size cap, not chunked.
- Agent and skill behaviour was validated by real runs on a small example, not by an automated evaluation set.

## 7. What I would change for production

- Use a dedicated **GitHub App token** (or PAT) for the commit so required checks run on the agent's commit, plus branch protection requiring human review of agent commits.
- Use an **API key with a spend cap** or a cloud-provider endpoint instead of a personal subscription token; add per-PR and per-day budgets.
- Run the agent in a **network-restricted sandbox** (egress allowlist) and load the workflow definition from a protected reusable workflow so the PR cannot alter it.
- Add an **eval harness**: a golden set of PRs with known expected decisions, run in CI on every change to the agent, skills or model version, with pass@k and cost/turn metrics; pin and upgrade model versions deliberately.
- Add **mutation testing** (e.g. Stryker) as a quality gate and a "break the code and check the test fails" step.
- **Observability**: persist traces (tool calls, tokens, cost, decisions) per run; alert on cost spikes, loop rates and guard rejections.
- Expose repository operations (changed files, coverage, test runner) through an **MCP server** instead of shell commands, and add per-package skills for new stacks.
- Ask for human approval (a label or a review comment) before pushing, and support `/retest` comments to re-run on demand.
