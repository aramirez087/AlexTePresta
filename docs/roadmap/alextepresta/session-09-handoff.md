# Session 09 Handoff — CI Gate (Final Epic Session)

## What Was Done

### Coverage Tooling
- Added `@vitest/coverage-v8@3.2.4` to `devDependencies` in `package.json`
- Added `coverage` block to `vitest.config.ts` (`provider: 'v8'`, `include: ['src/lib/domain/**']`, reporters: `text` + `json-summary`)

### Database Types
- Added `user_simulation_overrides` table to `src/lib/supabase/database.types.ts` (manual update matching migration `0007_simulation_settings.sql`)
- Removed `as unknown as` cast in `src/lib/domain/payments/applyPayment.ts` — `resolveSimulatedRate` now uses the typed client directly
- Cleaned up the `settings.value` cast in the same function

### Timeline `is_simulated` Propagation (Open Issue #2 from Session 08)
- Added `is_simulated?: boolean` to `InterestDebtRow` type in `src/lib/domain/views/getDebtTimeline.ts`
- `interest_debt_created` events now set `meta.simulated: idb.is_simulated ?? false`
- Added 2 new tests in `getDebtTimeline.test.ts` confirming `meta.simulated=true` for simulated rows and `meta.simulated=false` for real rows

### Build Fix — `force-dynamic` on 8 Pages
The production build failed with `NEXT_PUBLIC_SUPABASE_URL is required` during static prerendering of `/pay`. Root cause: 8 pages lacked `export const dynamic = 'force-dynamic'`, allowing Next.js to attempt SSG. Added the export to:

| Page | Path |
|------|------|
| `/pay` | `src/app/(debtor)/pay/page.tsx` |
| `/admin/debts/new` | `src/app/admin/debts/new/page.tsx` |
| `/admin/debts/[id]` | `src/app/admin/debts/[id]/page.tsx` |
| `/admin/payments` | `src/app/admin/payments/page.tsx` |
| `/admin/invites` | `src/app/admin/invites/page.tsx` |
| `/admin/debtors/[id]/register-payment` | `src/app/admin/debtors/[id]/register-payment/page.tsx` |
| `/invite/[token]` | `src/app/invite/[token]/page.tsx` |
| `/invite/error` | `src/app/invite/error/page.tsx` |

### GitHub Actions CI Workflow
- Created `.github/workflows/ci.yml`
  - Triggers on push and PR to `main`
  - Node version from `.nvmrc` (Node 22) via `actions/setup-node@v4`
  - `cache: npm` caches `~/.npm`
  - Steps: `npm ci` → `npm run check` → `npx vitest run` → `npm run build`
  - Env vars: standard Supabase local demo JWTs (public, documented, safe to commit; no real DB connection in CI)

### Vercel Cron Configuration
- Created `vercel.json` with cron schedule: `0 12 25 * *` (noon UTC, day 25 of each month = 6 AM Costa Rica time)

### Deliverable Documents
- `docs/roadmap/alextepresta/ci-go-no-go.md` — gate report with GO decision
- `docs/roadmap/alextepresta/session-09-handoff.md` — this file

## Decisions Made

### D1: Coverage provider — `@vitest/coverage-v8`
V8 native coverage; no instrumentation; matches installed vitest `^3.2.4`. No Istanbul alternative needed.

### D2: CI env vars — hardcoded demo JWTs
Standard Supabase local demo JWTs (`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`) are publicly documented by Supabase, work only against local instance. Checked into CI is appropriate — no real Supabase connection is made during build or unit tests.

### D3: CI does NOT start Supabase
Unit tests use mocked Supabase clients throughout. Starting Supabase in CI adds 60-90 seconds of latency with no proportional benefit. Migration testing is done locally via `supabase db reset`.

### D4: Manual `database.types.ts` update
`supabase gen types typescript --local` requires a running local Supabase instance. Manually added the `user_simulation_overrides` table type matching the migration exactly. This is equivalent to what `gen types` would produce.

### D5: `force-dynamic` added to all server-data pages
Rather than patching only `/pay`, added `force-dynamic` to all 8 pages that call `createAdminClient()` or `requireAdmin()`. This prevents future build failures when new Supabase functionality is added to a page.

## Quality Gate Status

| Gate | Result |
|------|--------|
| `npm run check` | ✅ Exit 0 |
| `npx vitest run` | ✅ 177/177 tests, exit 0 |
| `npx vitest run --coverage` | ✅ 99.09% stmts, 84.07% branches, 100% funcs |
| `npm run build` | ✅ Exit 0, 20 routes |
| Migration syntax review | ✅ 9 migrations, sequential, no gaps |
| `database.types.ts` current | ✅ Includes `user_simulation_overrides` |

## Epic Summary (Sessions 01–09)

AlexTePresta is a personal loan-management web app for tracking zero-rate installment debts that automatically convert partial payments into compound-interest sub-debts.

**Session 01:** Project scaffolding — Next.js 15, Supabase, TypeScript strict, Tailwind, ESLint, Vitest.

**Session 02:** Database schema — 9 tables (`users`, `debts`, `installments`, `interest_debts`, `payments`, `payment_applications`, `interest_accruals`, `settings`, `invites`), RLS policies for anon/debtor/admin, auth callback.

**Session 03:** Authentication — Google Sign-In via Supabase, invite-only access, `accept_invite` PL/pgSQL function, middleware redirects.

**Session 04:** Debt management — `create_debt_with_installments` PL/pgSQL function, admin UI for creating debts and viewing installments, installment generation domain logic.

**Session 05:** Payment application — `apply_payment` PL/pgSQL function (FIFO allocation), domain layer `applyPayment.ts`, admin approval flow, debtor payment submission.

**Session 06:** Views and timeline — `getDebtorOverview.ts` (multi-currency balance aggregation), `getDebtTimeline.ts` (event stream), `DebtTimeline` React component, debtor home, admin debtor page.

**Session 07:** Interest conversion and accrual — `accrueOne.ts` (compound monthly math with `decimal.js`), `runMonthlyAccrual.ts` (idempotent per `(period, interest_debt_id)`), cron route, updated `apply_payment` to create interest_debts on partial payment.

**Session 08:** Simulation mode — `user_simulation_overrides` table, simulated mirror interest_debts, dual-mode accrual (real + simulated), scenario projector pages, simulation toggle (`?mode=simulada`), amber timeline rendering.

**Session 09 (this session):** CI gate — coverage tooling, GitHub Actions workflow, `vercel.json` cron, fixed `force-dynamic` on 8 pages, completed `is_simulated` timeline propagation, typed `database.types.ts`. **Decision: GO.**

## Prior Session Links

| Session | File | Summary |
|---------|------|---------|
| 01 | [session-01-handoff.md](session-01-handoff.md) | Project scaffold |
| 02 | [session-02-handoff.md](session-02-handoff.md) | Schema + RLS |
| 03 | [session-03-handoff.md](session-03-handoff.md) | Auth + invites |
| 04 | [session-04-handoff.md](session-04-handoff.md) | Debt creation |
| 05 | [session-05-handoff.md](session-05-handoff.md) | Payment application |
| 06 | [session-06-handoff.md](session-06-handoff.md) | Views + timeline |
| 07 | [session-07-handoff.md](session-07-handoff.md) | Interest accrual |
| 08 | [session-08-handoff.md](session-08-handoff.md) | Simulation mode |
| 09 | [session-09-handoff.md](session-09-handoff.md) | CI gate (this file) |

## Production Checklist

Before deploying to Vercel:

- [ ] Configure `NEXT_PUBLIC_SUPABASE_URL` in Vercel dashboard (production project URL)
- [ ] Configure `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel dashboard
- [ ] Configure `SUPABASE_SERVICE_ROLE_KEY` in Vercel dashboard (production service role key)
- [ ] Configure `CRON_SECRET` in Vercel dashboard (generate with `openssl rand -hex 32`)
- [ ] Configure `NEXT_PUBLIC_APP_URL` in Vercel dashboard (production URL)
- [ ] Configure Google OAuth credentials (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`)
- [ ] Add production URL to Google Cloud Console authorized redirect URIs
- [ ] Run `supabase db push` to apply migrations to production Supabase project
- [ ] Verify cron job is enabled in Vercel dashboard (requires Pro plan)
- [ ] Add first admin user manually to `public.users` with `role='admin'`
- [ ] Run live RLS verification against production JWTs

## Open Issues (Carry-Forward)

1. **Live RLS verification** — Policies are source-audited; live JWT testing deferred.
2. **Admin UI for `user_simulation_overrides`** — No CRUD page at `/admin/debtors/[id]/simulation-rate`.
3. **JWT custom claims for role** — Role is looked up from `public.users` per request. Embed in JWT via Supabase auth hook to eliminate per-request DB call.
4. **Admin home N+1 queries** — 4 queries per debtor for balance aggregation; acceptable for small family loan book, fix if scale increases.
5. **`next lint` deprecation** — Migrate to `eslint` CLI when upgrading to Next.js 16.
6. **Full live smoke test** — Deferred due to OAuth dependency in automated session. Perform manually before first production use.
7. **CI pipeline live run** — `.github/workflows/ci.yml` is valid YAML but not yet run on GitHub Actions (epic worktree has no remote). Verify on first push to `main`.
