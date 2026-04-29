# Local Development Setup

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — required for Supabase local dev
- Node.js 22+ (use `.nvmrc`: `nvm use`)
- Supabase CLI is installed via `npx supabase` — no global install required

## Installation

```bash
# 1. Install Node dependencies
npm install

# 2. Copy environment template
cp .env.local.example .env.local
# The defaults in .env.local.example work with the local Supabase instance
# No edits needed for local dev
```

## Starting Local Supabase

```bash
npx supabase start
```

First run downloads ~1.5 GB of Docker images. Subsequent starts are fast.

Output includes the local API URL, anon key, and service_role key — these match the defaults in `.env.local.example`.

## Applying Migrations and Seed

```bash
npx supabase db reset
```

This command:
1. Drops and recreates the local database
2. Replays all migrations in `supabase/migrations/` in order
3. Runs `supabase/seed.sql`

After reset, a local admin user is seeded:
- Email: `alexramirez.cr@gmail.com`
- Password: `AdminDev123!`
- UUID: `00000000-0000-0000-0000-000000000001`

## Starting the App

```bash
npm run dev
```

App runs at http://localhost:3000.

## Supabase Studio

Database admin UI is available at http://127.0.0.1:54323 after `npx supabase start`.

Use the SQL Editor in Studio to verify RLS policies and inspect data.

## Useful Commands

```bash
# Check TypeScript + lint
npm run check

# Run tests
npm test

# Create a new migration file
npx supabase migration new <migration-name>

# Diff local schema against migrations
npx supabase db diff

# Stop local Supabase containers
npx supabase stop
```

## Verifying RLS Policies

In Supabase Studio SQL Editor:

```sql
-- Anon access returns empty sets (not errors)
SET LOCAL role anon;
SELECT * FROM public.users;    -- 0 rows
SELECT * FROM public.debts;    -- 0 rows
SELECT * FROM public.settings; -- 0 rows

-- Admin reads all
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT * FROM public.users;    -- 1 row (seeded admin)
SELECT public.is_admin();      -- true
```
