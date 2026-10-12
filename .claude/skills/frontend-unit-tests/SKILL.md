---
name: frontend-unit-tests
description: Write or update Vitest + React Testing Library unit tests for changed frontend code (components, hooks, API client, utilities) in the Taskly repo. Use when a PR changes files under frontend/src.
---

# Frontend unit tests (Vitest + React Testing Library)

Tests sit beside the code: `Component.tsx` → `Component.test.tsx`, `utils/todos.ts` → `utils/todos.test.ts`. Read the neighbouring tests first and match their style (no semicolons, single quotes, 2-space indent, as in `TodoItem.test.tsx`).

## Conventions in this repo

- Environment is `jsdom`; `src/test/setup.ts` already registers `@testing-library/jest-dom` matchers and cleanup. Do not edit it.
- Import `it`, `expect`, `vi` from `vitest`. Render with `render` from `@testing-library/react`; interact with `userEvent.setup()` and `await user.click(...)`.
- Query by accessible role/name/label first (`getByRole('button', { name: ... })`), then text; avoid test ids and CSS selectors.
- The design system is mocked in component tests: `vi.mock('../../../design-system', () => import('../../../design-system/mocks'))` (adjust the relative path). Copy this line from a neighbouring test.
- Reuse `src/test/todoFixture.ts` for todo data (`todoFixture`). Do not edit it; spread it to make variants: `{ ...todoFixture, completed: true }`.
- Data hooks (TanStack Query): wrap in a fresh `QueryClientProvider` per test with `retry: false`, and mock the API module with `vi.mock`, never `fetch` to a real server.
- Components with callbacks: assert the callback was called with the right argument **and** that the others were not (see `TodoItem.test.tsx`).

## Checklist for each changed unit

- Renders the expected content for each prop variant (empty, loading, error, populated).
- User interactions produce the right calls/state changes.
- Accessibility-visible behaviour (labels, disabled/busy states).
- Pure utilities: `it.each` tables with boundary values.

## Do not

Change `frontend/src/**` non-test files, `vite.config.ts`, `src/test/**`, stories, or the design-system; add dependencies; use snapshots as the only assertion; use real timers for waiting (`waitFor`/`findBy*` instead of sleeps).
