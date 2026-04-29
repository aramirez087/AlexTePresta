# ADR 0003 — Authorization Model

**Status**: Accepted

## Context

The app has two roles: `admin` (one user) and `debtor` (multiple users). Debtors must not see each other's data. The service-role key bypasses RLS entirely and must never reach the browser. A server-side bug that queries the wrong `user_id` must not expose another debtor's records.

## Decision

**Supabase Row-Level Security (RLS) is the authoritative authorization gate. Server-side TypeScript checks (`requireAdmin()`, `requireUser()`) layer on top for defense-in-depth and structured error responses — they never substitute for RLS.**

Specific rules:
- Admins: full read/write on all tables
- Debtors: read-only access to rows owned by `auth.uid()`
- Debtors: `INSERT` into `payments` only with `debtor_id = auth.uid()`, `created_by = auth.uid()`, `status = 'pending'`
- Debtors: no write access to any other table
- Anon: no access to any table (RLS denies; returns empty sets, not errors)
- Service-role key: server-only, enforced by `import 'server-only'` in `src/lib/supabase/admin.ts` and a runtime `typeof window !== 'undefined'` guard

## Consequences

**Positive:**
- Even if a server action has a logic bug, the DB refuses unauthorized reads/writes at the RLS layer.
- Anon access returns empty sets, not errors — reduces information leakage compared to a 403.
- A single `is_admin()` helper function centralizes the admin check; all policies reference it.

**Negative:**
- RLS policies must be maintained in sync with application logic. Divergence creates subtle bugs (e.g., server action succeeds but RLS silently drops the row). Mitigated by keeping RLS in a dedicated `0002_rls.sql` migration with named policies that match server action names.
- Service-role client must be restricted to server context. Two complementary guards are used: `import 'server-only'` (build-time bundler signal) and `typeof window !== 'undefined'` (runtime guard exercised by unit tests).
- Testing RLS policies requires either a real Supabase instance or a mock. Unit tests verify the guard logic in TypeScript; RLS correctness is verified by manual queries against the local Supabase instance during each session's quality gate.
