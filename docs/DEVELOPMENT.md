# Development

Setup, local-run, and verification guide for AlexTePresta. The companion doc `docs/setup/local-dev.md` covers the same Supabase commands in more depth; this file is the entry point.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — required by local Supabase
- Node.js 22 (`nvm use` reads `.nvmrc`)
- The Supabase CLI is invoked via `npx supabase` — no global install needed

## Setup

```bash
nvm install 22 && nvm use
npm install
cp .env.local.example .env.local
```

The example env contains working anon/service-role keys for the local Supabase instance — no edits required. Leave `GOOGLE_OAUTH_*` empty for local testing; you can sign in as the seeded admin instead. Set a non-empty `CRON_SECRET` if you intend to hit the cron routes.

## Start Supabase and apply schema

```bash
npx supabase start         # first run pulls ~1.5 GB of Docker images
npx supabase db reset      # drops, replays all migrations, runs seed
```

Seeded admin: `alexramirez.cr@gmail.com` / `AdminDev123!` (UUID `00000000-0000-0000-0000-000000000001`).

- App: http://localhost:3000
- Supabase Studio (DB UI): http://127.0.0.1:54323

## Run the app

```bash
npm run dev
```

## Quality gates

```bash
npm run check       # tsc strict + ESLint
npm test -- --run   # vitest, one-shot
npm run build       # production build
```

## Manual smoke test (the PRD gold path)

1. Sign in at `/login` as the seeded admin.
2. `/admin/invites` → create an invite, copy the `/invite/<token>` URL. Open it in an incognito window with a second user (create one in Studio → Authentication → Add user if needed).
3. As admin, `/admin/debts/new` → create the PRD example debt: total ₡591,500, 4 installments of ₡147,875, due day 25, currency CRC.
4. Verify `installments` has 4 rows, all `pending` (Studio → Table editor).
5. As debtor, `/app/pay` → submit ₡100,000.
6. As admin, `/admin/payments` → approve.
7. Verify in Studio:
   - First installment → `status='converted'`, `remaining_amount=0`
   - One new `interest_debts` row → `is_simulated=false`, `principal=4787500` (céntimos)
   - One parallel `interest_debts` row → `is_simulated=true`, `mirror_of` set
   - `payment_applications` rows reconstruct the allocation
8. On the debtor home, toggle "Modo simulación" → amber banner appears, balances flip to simulated track, no DB writes.

## Monthly accrual cron

```bash
curl -X POST http://localhost:3000/api/cron/monthly-accrual \
  -H "Authorization: Bearer $(grep ^CRON_SECRET .env.local | cut -d= -f2)"
```

Re-hit it — the second call must be a no-op. `interest_accruals` has exactly one row per `(interest_debt_id, period, mode)`.

## RLS sanity check

In Studio SQL Editor:

```sql
SET LOCAL role anon;
SELECT * FROM public.users;       -- 0 rows
SELECT * FROM public.debts;       -- 0 rows

SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT public.is_admin();         -- true
SELECT count(*) FROM public.users;-- 1
```

## Project layout

- `src/app/` — App Router pages and route handlers (admin, debtor, auth, cron)
- `src/lib/domain/` — pure domain logic (`debts`, `installments`, `payments`, `interest`, `views`)
- `src/lib/supabase/` — server, browser, and admin (service-role) clients
- `src/lib/auth/`, `src/lib/format/` — auth guards and money/date formatting
- `src/components/timeline/` — bank-style account-statement timeline
- `supabase/migrations/` — forward-only SQL migrations (init, RLS, schedule, accrual, simulation)
- `supabase/seed.sql` — local admin seed
- `docs/architecture/` — charter, data model, payment pipeline, interest model, UX spec
- `docs/adr/` — architecture decision records
- `docs/setup/` — local-dev and Google OAuth setup guides
- `docs/roadmap/alextepresta/` — epic CI go/no-go report

## Useful Supabase commands

```bash
npx supabase stop                          # stop containers
npx supabase migration new <name>          # new migration file
npx supabase db diff                       # diff local schema vs migrations
```

## Deploy

Production target is Vercel + a hosted Supabase project. Required env vars in production: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`. See `docs/setup/google-oauth.md` for the OAuth client configuration steps.
