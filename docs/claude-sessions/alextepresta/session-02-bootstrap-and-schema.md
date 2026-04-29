# Session 02: Project Bootstrap, Supabase Schema, and RLS

Paste this into a new Claude Code session:

```md
# Continuity
Continue from Session 01 artifacts.

# Mission
Scaffold the Next.js + TypeScript + Tailwind app, wire Supabase clients, and create the full Phase 1+2 database schema with RLS policies.

# Repository anchors
- docs/architecture/data-model.md (source of truth for schema)
- docs/adr/0001-stack-choice.md, 0003-authorization-model.md
- package.json, tsconfig.json, next.config.ts, .nvmrc (to create)
- supabase/migrations/ (to create)
- src/lib/supabase/ (to create)

# Tasks
1. Initialize Next.js 15 App Router project at repo root with TypeScript strict, Tailwind, ESLint. Pin Node in `.nvmrc`.
2. Add scripts to `package.json`: `check` = `tsc --noEmit && next lint`, `test` = `vitest`, plus `build`, `dev`, `start`.
3. Install: `@supabase/supabase-js`, `@supabase/ssr`, `decimal.js`, `zod`, `next-safe-action`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.
4. Configure `vitest.config.ts` with jsdom environment and path aliases mirroring `tsconfig.json` (`@/*` → `src/*`).
5. Create Supabase clients: `src/lib/supabase/server.ts` (cookie-based server client), `src/lib/supabase/browser.ts` (browser client), `src/lib/supabase/admin.ts` (service-role, server-only — throw if imported in a client component).
6. Author migration `supabase/migrations/0001_init.sql` creating `users`, `invites`, `debts`, `installments`, `interest_debts`, `payments`, `payment_applications`, `interest_accruals`, `settings`. Use `bigint` for amounts; `text` columns for `currency` ('CRC'|'USD'), `status` (per data-model.md), and enum-equivalents enforced by `CHECK`. Define FKs with explicit ON DELETE behavior. Add indexes on FKs and on `(debt_id, sequence_number)`, `(interest_debt_id, period)`.
7. Author migration `supabase/migrations/0002_rls.sql`: enable RLS on every table. Policies: admins read/write all; debtors read only rows where `user_id = auth.uid()`; debtors may `INSERT` into `payments` only with `created_by = auth.uid()` and `status = 'pending'`; debtors cannot write to any other table.
8. Add `supabase/seed.sql` creating one admin user (Alex) keyed off env email.
9. Add unit tests `src/lib/supabase/__tests__/clients.test.ts` covering: missing env throws, admin client refuses to instantiate when `typeof window !== 'undefined'`.
10. Document local Supabase startup commands in `docs/setup/local-dev.md` (incl. `supabase db reset`).

# Deliverables
- Next.js scaffold with `package.json` containing `check`, `test`, `build`
- supabase/migrations/0001_init.sql, 0002_rls.sql, supabase/seed.sql
- src/lib/supabase/{server,browser,admin}.ts + tests
- vitest.config.ts, .nvmrc
- docs/setup/local-dev.md
- docs/roadmap/alextepresta/session-02-handoff.md

# Quality gates
- `npm run check`
- `npx vitest run`
- `supabase db reset` applies both migrations cleanly (record command output in handoff).

# Exit criteria
- Fresh clone + `npm install` + `npm run check && npx vitest run` is green.
- Schema matches `docs/architecture/data-model.md` exactly; RLS verified by handoff-documented manual queries against an anon and authenticated debtor JWT.
```
