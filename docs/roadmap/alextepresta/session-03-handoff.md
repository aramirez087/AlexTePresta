# Session 03 Handoff

## What Was Done

### Auth Infrastructure
- [x] Generated `src/lib/supabase/database.types.ts` from local Supabase schema (includes all 9 tables + `is_admin` + `accept_invite` functions)
- [x] Updated all three Supabase clients (`server.ts`, `browser.ts`, `admin.ts`) to use `Database` generic type
- [x] `src/lib/auth/errors.ts` — `AuthRequiredError` and `ForbiddenError` typed error classes
- [x] `src/lib/auth/session.ts` — `requireUser()`, `requireAdmin()`, `currentRole()` server helpers with `server-only` guard

### Invite Flow
- [x] `supabase/migrations/0003_invite_accept_fn.sql` — PL/pgSQL `accept_invite(p_token, p_user_id, p_email)` function:
  - Uses `SELECT ... FOR UPDATE` to prevent race conditions
  - Validates: token exists, not expired, not consumed, email matches
  - Atomically upserts `public.users` + marks invite consumed
  - GRANT restricted to `service_role` only
- [x] `src/lib/safe-action.ts` — thin `next-safe-action` client
- [x] `src/lib/auth/actions.ts` — `createInvite(email)` server action: Zod validation, 32-byte crypto-random token, 7-day expiry, admin-only

### Route Protection
- [x] `src/middleware.ts` — session refresh on every request; redirects unauthenticated `/app/*` and `/admin/*` to `/login?next=<path>`; redirects non-admin users away from `/admin/*` to `/app`

### UI Pages
- [x] `src/app/login/_components/sign-in-button.tsx` — Client Component with Google OAuth button (Google logo SVG, Spanish label)
- [x] `src/app/login/page.tsx` — Server Component wrapper with Suspense boundary
- [x] `src/app/auth/callback/route.ts` — OAuth code exchange; if `pending_invite` cookie present, calls `accept_invite` RPC; `token_consumed` treated as success (idempotency)
- [x] `src/app/invite/[token]/page.tsx` — Server Component: validates token (expired, consumed, not found), guards against admin downgrade, sets `pending_invite` HttpOnly cookie (15-min TTL), redirects through OAuth
- [x] `src/app/invite/error/page.tsx` — Spanish error page for callback-routed errors
- [x] `src/app/admin/invites/_components/create-invite-form.tsx` — Client Component: email input, calls `createInvite`, shows generated link with copy button
- [x] `src/app/admin/invites/page.tsx` — Server Component: `requireAdmin()` defense-in-depth, lists invites with status (Pendiente/Expirada/Utilizada) in Spanish, `es-CR` date locale
- [x] `src/app/app/page.tsx` — Stub page: `requireUser()`, shows email and role

### Tests (31 passing)
- [x] `src/lib/auth/__tests__/session.test.ts` — 9 tests: `requireUser` (passes/throws), `requireAdmin` (admin passes, debtor throws, anon throws), `currentRole` (admin/debtor/null/ghost)
- [x] `src/lib/auth/__tests__/actions.test.ts` — 5 tests: `createInvite` happy path (64-char token), non-admin throws, Zod validation, token format, expiry math
- [x] `src/lib/auth/__tests__/invite-acceptance.test.ts` — 7 tests: all RPC result codes (ok, expired, consumed, not_found, email_mismatch), RPC call parameters, idempotent token_consumed handling
- [x] `src/__tests__/middleware.test.ts` — 6 tests: unauth→/admin redirect, unauth→/app redirect, admin passes /admin, debtor blocked from /admin, auth+unauth pass /login

### Documentation
- [x] `docs/setup/google-oauth.md` — Google Cloud Console setup, Supabase Dashboard configuration, redirect URL allowlist, local dev env vars, troubleshooting table

## Quality Gate Results

### `npm run check` (tsc + next lint)
```
✔ No ESLint warnings or errors
```
**Result: PASS**

### `npx vitest run`
```
Test Files  5 passed (5)
     Tests  31 passed (31)
  Duration  221ms
```
**Result: PASS** — 31/31 tests

## Decisions Made

1. **HttpOnly cookie for invite token through OAuth** (`pending_invite`, 15-min TTL, SameSite=Lax) — Cookie survives the Google OAuth round-trip reliably. The alternative (OAuth `state` parameter) would have required Supabase to echo it back, which it doesn't guarantee.

2. **`accept_invite` as a `SECURITY DEFINER` Postgres function** — The invite acceptance must be atomic (validate + upsert user + mark consumed in one transaction). PostgREST can't issue raw `BEGIN/COMMIT`, so a PL/pgSQL function is the correct mechanism. Called exclusively via the service-role client.

3. **`token_consumed` treated as success in callback** — If the OAuth redirect completes twice (e.g., network error on first redirect), the second call to `accept_invite` returns `token_consumed`. The callback treats this as a success and redirects to `/app` instead of showing an error. This makes acceptance idempotent.

4. **Admin downgrade guard in invite page** — If an admin accidentally visits an invite link while already signed in, the page checks their existing role and blocks with a clear Spanish error message instead of silently downgrading to `debtor`.

5. **PostgREST partial-select type cast** — `supabase.from('users').select('role').single()` returns `never` for the data type in TypeScript strict mode (Supabase client v2 template literal type inference limitation with `@supabase/ssr`). Fixed with explicit `as { role: string } | null` casts at documented trust boundaries.

6. **RPC return type cast** — `accept_invite` returns `Json` (as typed by Supabase). Cast to `{ ok: boolean; error?: string } | null` at the call site with boundary comment.

## Manual Smoke Test Plan

Run before marking Session 3 complete:

1. `npx supabase start` + `npm run dev`
2. Navigate to `http://localhost:3000/admin` → should redirect to `/login?next=%2Fadmin`
3. Sign in with the admin Google account → should land at `/admin` (currently 404 since `/admin/page.tsx` doesn't exist) or `/admin/invites`
4. Navigate to `http://localhost:3000/admin/invites`
5. Create invite for a second Google account email → copy the `/invite/<token>` link
6. Open in incognito → click "Iniciar sesión con Google" on the invite page → accept with second Google account
7. Verify landing on `/app` with email + role = debtor shown
8. Verify navigating to `http://localhost:3000/admin` while signed in as debtor → redirected to `/app`
9. Verify the invite shows as "Utilizada" in the admin list

> **Note**: Google OAuth requires actual Google Cloud credentials configured in the Supabase Dashboard.
> For local testing with the local Supabase stack, see `docs/setup/google-oauth.md` Step 5.

## Open Issues for Session 04

1. **JWT custom claims for role** — The middleware currently queries `public.users` on every `/admin/*` request to check the role. A more efficient approach is to store the role in `app_metadata.role` via a Supabase Auth hook, enabling a local JWT claim check. Deferred to Session 4 or 5.

2. **`/admin` root page (404)** — `src/app/admin/page.tsx` does not exist. A redirect from `/admin` to `/admin/invites` (or a proper dashboard) should be created in Session 4. Middleware protects the route but the page itself 404s.

3. **Typed Supabase clients — partial select workaround** — The `as { role: string } | null` casts in `session.ts` and `middleware.ts` are needed because Supabase JS v2 template literal type inference produces `never` for single-column selects in some TypeScript strict configurations. Revisit in a future session when `@supabase/supabase-js` resolves this.

4. **Email delivery for invites** — Admin copies the invite URL manually. A future session should wire up Resend or Supabase SMTP so the invite link is sent automatically by email.

5. **`next lint` deprecation** — Carried over from Session 2. `next lint` is deprecated in Next.js 15.5+. Migrate to `eslint` CLI before Next.js 16.

6. **`/app` stub page** — `src/app/app/page.tsx` is a bare minimum stub. Session 4 should build out the debtor dashboard view.

## Session 04 Inputs

### Files to Read
- `src/lib/auth/session.ts` — `requireUser`, `requireAdmin`, `currentRole`
- `src/lib/auth/actions.ts` — `createInvite` server action pattern
- `src/middleware.ts` — route protection logic
- `supabase/migrations/0003_invite_accept_fn.sql` — invite acceptance transaction
- `docs/architecture/payment-pipeline.md` — FIFO pipeline for Phase 1

### Next Steps for Session 4
1. Create `src/app/admin/page.tsx` (redirect to `/admin/invites` or proper dashboard)
2. Build the debtor dashboard at `src/app/app/` showing the user's debts/installments
3. Implement debt creation (admin creates a debt for a debtor)
4. Begin installment generation logic

### Environment Variables Status
| Variable | Status |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Set (local: `http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Set (local) |
| `SUPABASE_SERVICE_ROLE_KEY` | Set (local) |
| `NEXT_PUBLIC_APP_URL` | Needed for production Vercel URL |
| Google OAuth credentials | Configured in Supabase Dashboard only; not in env vars |
