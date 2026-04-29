# ADR 0003 — Authorization Model

**Status:** Accepted  
**Date:** 2026-04-28  
**Deciders:** Alexander Ramirez

---

## Context

AlexTePresta has two roles: `admin` (single user) and `debtor` (multiple users). The authorization requirements are:

1. **Debtors must not see other debtors' data** — not their debts, not their payments, not their installments.
2. **Debtors can submit payments but cannot approve them** — only admin can transition a payment from `pending` to `approved`.
3. **The service-role key bypasses all RLS policies** — it must never be exposed to the browser.
4. **Invitation-only access** — unauthenticated requests must never return any user data.
5. **Defense in depth** — a single bug in server-side TypeScript code must not expose unauthorized data.

Supabase provides Row-Level Security (RLS) at the PostgreSQL layer and a service-role key that bypasses RLS for server-side admin operations.

---

## Decision

**Supabase Row-Level Security (RLS) is the authoritative authorization gate.** No query reaches the database without passing through the applicable RLS policies. Server-side TypeScript role checks (`requireAdmin()`, `requireUser()`) are a defense-in-depth layer that provides structured error responses — they do not substitute for RLS.

### RLS Policy Principles

1. **Debtors see only their own rows.** For all tables keyed by `debtor_id` or `created_by`, the RLS `SELECT` policy filters `auth.uid() = debtor_id`.
2. **Admin sees all rows.** A helper function `is_admin()` reads the caller's `role` from the `users` table and returns `true` for `role = 'admin'`.
3. **Anon access is denied by default.** `CREATE POLICY` statements use `USING (auth.role() = 'authenticated')` as the base condition; unauthenticated requests return empty result sets, not errors.
4. **`payment_applications` are read-only.** No `UPDATE` or `DELETE` RLS policy exists for this table. Even admin cannot delete audit records via the application layer.

### Service-Role Key Restriction

- The service-role key is stored in `SUPABASE_SERVICE_ROLE_KEY` — no `NEXT_PUBLIC_` prefix.
- The server-side Supabase admin client (constructed with the service-role key) may only be instantiated in server context.
- A build-time guard throws at module initialization if the admin client is instantiated in a browser context:
  ```ts
  // boundary: server-only — service-role key must never reach the browser
  if (typeof window !== 'undefined') {
    throw new Error('supabaseAdmin must not be used in browser context')
  }
  ```
- Next.js `server-only` package is imported in the admin client module to generate a compile-time error if the module is accidentally imported from a Client Component.

### Server-Side Role Checks

```ts
// Throws 401 if no session; 403 if session exists but role != 'admin'
async function requireAdmin(): Promise<User>

// Throws 401 if no session; 403 if session.user.id != userId
async function requireUser(userId: string): Promise<User>
```

These functions are called at the top of every Server Action and Route Handler that mutates state. They provide structured error responses (typed `ActionError`) before any database query runs. They do not bypass RLS — they are additive.

---

## Rationale

**RLS as authoritative gate** — If a server action has a logic bug that passes an incorrect `user_id` to a query, the RLS policy still rejects the unauthorized read or write at the database layer. The application layer cannot accidentally widen access beyond what RLS permits (when using the anon/session client; the service-role client is restricted to trusted server paths).

**Defense in depth, not substitution** — Server-side role checks provide fast-fail behavior, structured error types, and logging before the database query runs. They complement RLS rather than replacing it. If both are consistent, the system is correct; if they diverge, the stricter one (RLS) wins.

**Anon returns empty sets** — Returning `[]` instead of a `403` for unauthenticated queries reduces information leakage (an attacker cannot distinguish "no data" from "access denied").

---

## Consequences

### Positive

- A server-side logic bug cannot expose another debtor's data — RLS blocks it at the DB layer.
- Service-role key is never in the browser bundle; Vercel's build environment keeps it server-side.
- `server-only` package generates a compile-time error if the admin client is imported in a Client Component.
- RLS policies are versioned in `supabase/migrations/0002_rls.sql` — auditable and reproducible.

### Negative / Mitigations

- **RLS and application logic must stay in sync:** A policy change that doesn't have a corresponding application layer update (or vice versa) can cause subtle authorization bugs. Mitigation: RLS policies are in their own named migration (`0002_rls.sql`) with explicit policy names matching the server-side function names; integration tests verify that a debtor cannot read another debtor's data even with direct Supabase client calls.
- **`is_admin()` function performance:** The helper reads from the `users` table on every RLS evaluation. Mitigation: index on `(id, role)` in the `users` table; PostgreSQL caches the function result within a single transaction.
- **Service-role client must be explicitly restricted:** There is no automatic enforcement that the admin client uses the service-role key and not the anon key. Mitigation: the admin client module exports a single typed function `getAdminClient()` that always uses `SUPABASE_SERVICE_ROLE_KEY`; no other code constructs a Supabase client with the service-role key.
