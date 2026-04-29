# Session 01 Handoff

## What Was Done

Architecture documentation created from scratch for the AlexTePresta epic:

- [x] `docs/architecture/charter.md` — Vision, phases, scope, glossary
- [x] `docs/architecture/data-model.md` — Full ERD (Mermaid) + exact column specs for all 9 tables
- [x] `docs/architecture/payment-pipeline.md` — FIFO pseudocode for Phase 1 and Phase 2
- [x] `docs/architecture/interest-model.md` — Monthly compound formula, rounding, idempotency
- [x] `docs/architecture/ux-partial-payment.md` — Spanish UX copy, confirmation flow, visual cues
- [x] `docs/adr/0001-stack-choice.md` — Next.js 15 + Supabase + Vercel decision
- [x] `docs/adr/0002-money-representation.md` — bigint minor units + decimal.js
- [x] `docs/adr/0003-authorization-model.md` — Supabase RLS authoritative
- [x] `docs/adr/0004-idempotent-jobs.md` — Period-keyed cron jobs

No application code was written in Session 1.

## Key Decisions

- **ADR 0001**: Next.js 15 App Router + Supabase + Vercel chosen for free tier coverage, built-in Auth/RLS, and minimal ops overhead.
- **ADR 0002**: All money as `bigint` minor units. `decimal.js` for interim math. Half-even rounding before persistence.
- **ADR 0003**: RLS is authoritative. TypeScript checks add defense-in-depth only.
- **ADR 0004**: All cron jobs idempotent via `INSERT ... ON CONFLICT DO NOTHING` on natural keys.

## Open Issues / Deferred Questions

- `payment_applications.target_id` is a logical polymorphic FK — no DB-level referential integrity. True FK would require two nullable columns (`installment_id`, `interest_debt_id`) with a CHECK. Polymorphic pattern chosen for loop uniformity. Re-evaluate if a third target type ever appears.
- `due_day` capped at 28 to avoid February edge case. Loans with day 29/30/31 must use 28. Disclosed in UI help text. Admin must be aware of this limitation when creating debts.
- Currency support limited to CRC and USD. Adding a new currency requires altering the CHECK constraint and updating the UI.

## Session 02 Inputs

### Pinned Versions

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

| Variable | Source |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project settings → API → anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings → API → service_role secret key |
| `GOOGLE_OAUTH_CLIENT_ID` | Google Cloud Console → OAuth 2.0 credentials |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google Cloud Console → OAuth 2.0 credentials |
| `CRON_SECRET` | Generate: `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` for local dev; Vercel URL for production |

### Bootstrap Commands for Session 02

```bash
# 1. Scaffold Next.js 15 (run from repo root)
CI=true npx create-next-app@15 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git

# 2. Pin Node version
echo "22" > .nvmrc

# 3. Install runtime dependencies
npm install @supabase/supabase-js@^2.49 @supabase/ssr@^0.5 decimal.js@^10.4 zod@^3.23 next-safe-action@^7.3 server-only

# 4. Install dev dependencies
npm install -D vitest@^3.1 @testing-library/react@^16 @testing-library/jest-dom@^6 jsdom@^26 @vitejs/plugin-react

# 5. Initialize Supabase local dev
npx supabase init

# 6. Apply migrations + seed (requires Docker Desktop running)
npx supabase db reset
```

### Architecture Files to Read at Session 02 Start

- `docs/architecture/data-model.md` — schema source of truth for migration authoring
- `docs/adr/0001-stack-choice.md` — technology constraints
- `docs/adr/0003-authorization-model.md` — RLS policy design rationale
