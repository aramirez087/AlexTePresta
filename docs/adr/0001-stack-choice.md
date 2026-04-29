# ADR 0001 — Stack Choice

**Status**: Accepted

## Context

AlexTePresta is a single-developer project that must deploy cheaply with minimal operational overhead. Family member debtors need reliable uptime. The admin needs database introspection without custom tooling. Time-to-feature matters more than maximum flexibility.

## Decision

**Next.js 15 (App Router) + Supabase (PostgreSQL + Auth) + Vercel + TypeScript strict + Tailwind CSS**

## Consequences

**Positive:**
- Free tiers on Vercel + Supabase cover expected load (< 100 MAU, < 10 GB storage).
- App Router Server Components co-locate data fetching with rendering, reducing round trips for the debtor dashboard.
- Supabase provides Google OAuth out of the box, Row-Level Security, managed migrations, and a built-in dashboard that serves as the admin's database introspection tool.
- TypeScript strict mode catches money-handling bugs at compile time (no implicit `any`, no unchecked indexing).
- Tailwind CSS eliminates a CSS build step and keeps component styles co-located.

**Negative:**
- Next.js App Router's caching model (per-segment `revalidatePath`/`revalidateTag`) adds complexity; mutations must explicitly revalidate cached pages.
- Vercel cron jobs require the Pro plan for sub-hourly granularity. Monthly accrual fits daily invocation (run once a day; the cron handler skips execution if today is not the target run day). This means the monthly accrual may be delayed by up to 23 hours if the target day is chosen incorrectly.
- Supabase free tier has a 500 MB database limit and pauses after 7 days of inactivity. Not a concern for active use, but noted.
