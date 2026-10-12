---
name: backend-unit-tests
description: Write or update Vitest unit tests for changed backend code (Express routers, Zod validators, mappers, repository, config) in the Taskly repo. Use when a PR changes files under backend/src.
---

# Backend unit tests (Vitest + Supertest)

Tests live in `backend/tests/*.test.ts`, one file per unit (`router.test.ts`, `repository.test.ts`, `validators.test.ts`, `mappers.test.ts`). Read the neighbouring test file for the unit before writing anything and match it.

## Conventions in this repo

- Imports use explicit `.ts` extensions: `import { x } from '../src/features/todos/router.ts'`. Import test helpers from `vitest` (`it`, `expect`, `vi`, `afterEach`).
- Shared data comes from `backend/tests/fixture.ts` (`record` = database row, `todo` = API shape). Reuse it; do not edit it unless adding a new, clearly separate export is unavoidable.
- **Routers**: build a tiny Express app around `createTodosRouter(repository)` with a fake repository made of `vi.fn()` and exercise it with `supertest`. Assert status, body, and how the repository was (or was not) called. See `setup()` in `router.test.ts`.
- **Repository**: create the real Prisma client via `createDatabase('postgresql://test:test@localhost:5432/test')` and mock the delegate with `vi.spyOn(database.todo, 'findMany')`. No PostgreSQL is needed; never connect to a real database. Use `afterEach(() => vi.restoreAllMocks())`.
- **Validators / mappers**: pure functions; use `it.each` tables for valid and invalid inputs, including boundaries (empty, max length, impossible dates). These two files have a 100 % per-file coverage threshold in `vitest.config.ts`: keep it passing.
- **Config / lifecycle**: stub `process.env` with `vi.stubEnv` and restore with `vi.unstubAllEnvs()`; never read the real `.env`.

## Checklist for each changed unit

- Success path, each validation/error branch, not-found paths, and "collaborator not called" assertions on rejection.
- Boundary values for any new constraint.
- Deterministic: freeze time with `vi.useFakeTimers()` only when needed and always restore it.
- A new test file only if none exists for the unit.

## Do not

Change `backend/src/**`, `vitest.config.ts`, `package.json`, or the Prisma schema; start servers or open ports other than through `supertest`; add dependencies.
