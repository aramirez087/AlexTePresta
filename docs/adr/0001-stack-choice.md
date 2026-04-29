# ADR 0001 — Stack Choice

**Status:** Accepted  
**Date:** 2026-04-28  
**Deciders:** Alexander Ramirez

---

## Context

AlexTePresta is a single-developer personal project with a small, fixed user base (one admin, a handful of non-technical debtors). The primary constraints are:

1. **Cost:** must run at zero or near-zero cost under expected load (< 10 concurrent users, < 1 000 transactions/month).
2. **Ops simplicity:** no dedicated server, no managed Kubernetes, no infra team.
3. **Admin introspection:** admin needs to inspect raw data occasionally without a custom reporting UI.
4. **Type safety:** monetary state transitions must be type-checked to avoid class of bugs that `number` causes.
5. **Auth:** Google Sign-In for debtors (familiar to family members); admin uses the same SSO.

---

## Decision

The application stack is:

| Layer | Choice |
|-------|--------|
| Framework | **Next.js 15 (App Router)** |
| Language | **TypeScript** with `strict: true` |
| Styling | **Tailwind CSS v4** |
| Database | **Supabase (PostgreSQL 15+)** |
| Auth | **Supabase Auth** (Google OAuth provider) |
| Hosting | **Vercel** (hobby/pro plan) |
| Money math | **decimal.js** (intermediate) + `bigint` (storage) |
| Validation | **Zod** |
| Server actions | **next-safe-action** |
| Testing | **Vitest** + Testing Library + jsdom |

---

## Rationale

**Next.js 15 App Router** — Server Components co-locate data fetching with rendering, eliminating redundant API round trips. Server Actions allow mutations without a separate REST layer, reducing surface area. The App Router's nested layouts make per-segment revalidation explicit via `revalidatePath`.

**Supabase** — Provides PostgreSQL (the only database with the FIFO `SELECT FOR UPDATE` semantics the payment pipeline requires), Row-Level Security (authoritative authorization layer), Google OAuth provider integration, built-in dashboard for raw data introspection, and a local dev CLI (`supabase start`) for migration testing.

**Vercel** — Zero-config deployments from GitHub, preview environments per PR, and free-tier cron jobs (daily granularity). Monthly accrual fits daily granularity (cron runs on day 25 of each month).

**TypeScript strict** — Prevents `any` drift; makes monetary `bigint` types unambiguously different from `number`.

**Tailwind CSS v4** — No custom CSS build step; utility-first classes are self-documenting in JSX.

---

## Consequences

### Positive

- Free tier on Vercel + Supabase covers expected load indefinitely.
- Supabase dashboard gives admin SQL access without a custom reporting page.
- App Router Server Components reduce round trips and keep data fetching close to rendering logic.
- Google OAuth is configured in the Supabase dashboard with no custom OAuth server.
- RLS policies enforce authorization at the database layer, independent of application bugs.

### Negative / Mitigations

- **App Router caching complexity:** Next.js per-segment caches require explicit `revalidatePath` or `revalidateTag` calls after every mutation. Mitigation: all mutations go through `next-safe-action` server actions that call `revalidatePath` as their last step.
- **Vercel cron granularity:** Sub-hourly crons require the Pro plan (~$20/month). The monthly accrual cron needs only daily granularity (run once per month on day 25), which is free. If sub-daily granularity is ever needed, the cron can be triggered via an external free-tier scheduler (e.g., cron-job.org).
- **`bigint` JSON serialization:** `bigint` values cannot be serialized with `JSON.stringify` natively. All trust boundaries (Server Action return values, API responses) must convert `bigint` to `string`. This is documented in [ADR 0002](./0002-money-representation.md).
- **No multi-region:** Vercel hobby/pro serves from a single region; acceptable for a personal family app with users in Costa Rica.
