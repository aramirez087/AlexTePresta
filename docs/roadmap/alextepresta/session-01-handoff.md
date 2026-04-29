# Session 01 Handoff — Architecture Charter & Documentation

**Date:** 2026-04-28  
**Branch:** `epic/alextepresta`  
**Session type:** Documentation only — no application code was written.

---

## What Was Done

All ten planned deliverables were created:

- [x] `docs/architecture/charter.md` — Vision, target users, Phase 1/2/3 scopes, out-of-scope, glossary
- [x] `docs/architecture/data-model.md` — Mermaid ERD + full column specs for all 9 tables, FK ON DELETE summary, migration notes
- [x] `docs/architecture/payment-pipeline.md` — FIFO pseudocode for Phase 1, partial-payment conversion pseudocode for Phase 2, transaction boundaries, `SELECT FOR UPDATE` points, error taxonomy, reconstruction guarantee
- [x] `docs/architecture/interest-model.md` — Monthly compound formula, `decimal.js` precision config, half-even rounding example (₡47875 → ₡48833), real vs simulated mode, accrual cron spec with idempotency pattern, rate snapshot guarantee
- [x] `docs/architecture/ux-partial-payment.md` — Full confirmation flow, Spanish copy templates, Tailwind color classes, admin direct-register path, post-approval timeline events, accessibility requirements
- [x] `docs/adr/0001-stack-choice.md` — Next.js 15 App Router + Supabase + Vercel
- [x] `docs/adr/0002-money-representation.md` — bigint minor units + decimal.js + half-even rounding
- [x] `docs/adr/0003-authorization-model.md` — Supabase RLS authoritative, service-role key restriction, server-only guard
- [x] `docs/adr/0004-idempotent-jobs.md` — Period-keyed cron jobs, `ON CONFLICT DO NOTHING` pattern
- [x] `docs/roadmap/alextepresta/session-01-handoff.md` — this file

---

## Key Decisions Made

| # | Decision | ADR |
|---|----------|-----|
| 1 | Next.js 15 App Router + Supabase + Vercel as the full stack | [ADR 0001](../../adr/0001-stack-choice.md) |
| 2 | All monetary amounts stored as `bigint` minor units; `decimal.js` for arithmetic; half-even rounding | [ADR 0002](../../adr/0002-money-representation.md) |
| 3 | Supabase RLS is authoritative; server-side TypeScript checks are defense-in-depth only | [ADR 0003](../../adr/0003-authorization-model.md) |
| 4 | Scheduled jobs are idempotent via `UNIQUE` constraints + `INSERT ... ON CONFLICT DO NOTHING` | [ADR 0004](../../adr/0004-idempotent-jobs.md) |
| 5 | `payment_applications.target_id` is a logical polymorphic FK; integrity enforced at app layer | [data-model.md](../../architecture/data-model.md) |
| 6 | `interest_rate` on `interest_debts` is a snapshot string; immutable after creation | [interest-model.md](../../architecture/interest-model.md) |
| 7 | `due_day` capped at 28; `start_month` stored as `text 'YYYY-MM'` to avoid timezone ambiguity | [data-model.md](../../architecture/data-model.md) |

---

## Open Issues / Deferred Questions

### 1. Polymorphic FK on `payment_applications.target_id`

The current design uses `target_type / target_id` (polymorphic pattern) rather than two nullable FK columns (`installment_id`, `interest_debt_id`). The trade-off:

- **Chosen:** Single `target_id` simplifies the FIFO loop and allows a third target type without a schema change.
- **Rejected:** Two nullable FKs with a `CHECK (installment_id IS NOT NULL OR interest_debt_id IS NOT NULL)` would give true DB-level referential integrity but would require branching in the pipeline loop.

**Re-evaluate if:** a third target type ever appears, or if a DB-level integrity violation occurs in production and the polymorphic pattern is identified as the cause.

### 2. `due_day = 28` cap

Admin cannot create debts with due day 29, 30, or 31. Real-world loans with these due dates must use 28 as the closest safe approximation. This limitation is disclosed in the UI help text (to be implemented in Session 4).

### 3. Currency extensibility

Adding a third currency requires:
1. A migration to alter the `CHECK (currency IN ('CRC', 'USD'))` constraint on `debts`, `payments`.
2. A UI update to the currency selector.
3. Verification that the currency's minor-unit factor is 100 (the display logic assumes 100 for both current currencies).

### 4. Session 7 unit test anchor

`docs/architecture/interest-model.md` contains an exact unit test assertion that must be implemented in Session 7:

```ts
expect(accrue({ opening: 47875n, annualRate: '0.24' })).toEqual({
  accrued: 958n,
  closing: 48833n,
})
```

---

## Session 02 Inputs

### Pinned Dependency Versions

| Package | Version |
|---------|---------|
| Node.js | `22.x` (LTS) — pin in `.nvmrc` as `22` |
| Next.js | `15.3.x` |
| `@supabase/supabase-js` | `^2.49` |
| `@supabase/ssr` | `^0.5` |
| `decimal.js` | `^10.4` |
| `zod` | `^3.23` |
| `next-safe-action` | `^7.3` |
| `vitest` | `^3.1` |
| `@testing-library/react` | `^16` |
| `@testing-library/jest-dom` | `^6` |
| `jsdom` | `^26` |
| TypeScript | `^5.8` |
| Tailwind CSS | `^4` |

### Required Environment Variables

| Variable | Description | Where to find |
|----------|-------------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous (public) key | Supabase dashboard → Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — server-only, **never** prefix with `NEXT_PUBLIC_` | Supabase dashboard → Settings → API → service_role key |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client ID | Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth client secret | Google Cloud Console → APIs & Services → Credentials |
| `CRON_SECRET` | Random secret for authenticating Vercel cron route calls | Generate: `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | Canonical app URL | Set to `https://<your-vercel-domain>` or `http://localhost:3000` in dev |

### Bootstrap Commands for Session 02

```bash
# 1. Scaffold Next.js 15 (run from repo root)
npx create-next-app@15 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git

# 2. Pin Node version
echo "22" > .nvmrc

# 3. Install runtime dependencies
npm install @supabase/supabase-js @supabase/ssr decimal.js zod next-safe-action

# 4. Install dev/test dependencies
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react

# 5. Initialize Supabase local dev
npx supabase init

# 6. Start local Supabase (requires Docker)
npx supabase start

# 7. Create .env.local from example
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
# from the output of `npx supabase start`

# 8. Apply migrations (after writing 0001_init.sql and 0002_rls.sql)
npx supabase db reset
```

### Architecture Files to Read at Session 02 Start

1. [`docs/architecture/data-model.md`](../../architecture/data-model.md) — schema source of truth; write migrations directly from this document
2. [`docs/adr/0001-stack-choice.md`](../../adr/0001-stack-choice.md) — stack rationale, cron granularity notes
3. [`docs/adr/0003-authorization-model.md`](../../adr/0003-authorization-model.md) — RLS design, service-role key restriction, `server-only` guard

### Session 02 Scope

Session 02 implements:
1. `create-next-app` scaffold with the pinned versions above
2. Vitest configuration (`vitest.config.ts`)
3. Supabase migration `0001_init.sql` — all tables, constraints, and indexes from `data-model.md`
4. Supabase migration `0002_rls.sql` — all RLS policies
5. Supabase migration `0003_seed_settings.sql` — seed rows for `settings` table
6. `src/lib/supabase/` — browser client, server client, admin client (with `server-only` guard)
7. TypeScript types generated from the Supabase schema (`supabase gen types typescript`)
8. `npm run build`, `npm run check`, `npx vitest run` must all pass
