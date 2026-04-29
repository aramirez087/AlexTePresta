# Session 03: Google Sign-In and Invitation Flow

Paste this into a new Claude Code session:

```md
# Continuity
Continue from Session 02 artifacts.

# Mission
Implement Google Sign-In via Supabase plus the admin-issued invitation acceptance flow with role assignment.

# Repository anchors
- src/lib/supabase/{server,browser,admin}.ts
- supabase/migrations/0001_init.sql (users, invites tables)
- src/middleware.ts, src/app/login/, src/app/auth/callback/, src/app/invite/[token]/, src/app/admin/invites/ (to create)
- src/lib/auth/ (to create)

# Tasks
1. Document Supabase dashboard setup for Google OAuth in `docs/setup/google-oauth.md` (redirect URLs, scopes). The app reads only env vars; no client IDs in code.
2. Implement `src/middleware.ts` that refreshes the Supabase session and redirects unauthenticated requests away from `/app/*` and `/admin/*`.
3. Implement `src/app/login/page.tsx` with a Google sign-in button (Supabase OAuth) and `src/app/auth/callback/route.ts` to complete the OAuth code exchange.
4. Implement `src/lib/auth/session.ts` with server helpers: `requireUser()`, `requireAdmin()`, `currentRole()`. Each throws on failure with a typed error class.
5. Implement admin server action `createInvite(email)` that inserts into `invites` with a 32-byte cryptographically random token, 7-day expiry, and inviter_id = current admin id. Email delivery is out of scope — admin copies the resulting `/invite/{token}` URL from the UI.
6. Implement `src/app/invite/[token]/page.tsx`: server-side validates token (not expired, not consumed), routes the visitor through Google sign-in, then atomically (single transaction) inserts/updates `users` with `role='debtor'` linked to the invite's email, marks the invite consumed, and redirects to `/app`. Reject expired or used tokens with a clear Spanish error page.
7. Build `src/app/admin/invites/page.tsx`: form to create invites, list of pending invites with copy-link button.
8. Tests: unit-test `requireAdmin` (admin passes, debtor throws, anon throws). Test invite acceptance happy path and expired-token / consumed-token rejection paths against an in-memory Supabase test harness (or carefully mocked client). Integration test the middleware redirect for unauthenticated access to `/admin`.

# Deliverables
- src/middleware.ts
- src/app/login/page.tsx, src/app/auth/callback/route.ts
- src/app/invite/[token]/page.tsx, src/app/admin/invites/page.tsx
- src/lib/auth/session.ts + tests
- docs/setup/google-oauth.md
- docs/roadmap/alextepresta/session-03-handoff.md

# Quality gates
- `npm run check`
- `npx vitest run`
- Manual smoke (record steps + outcomes in handoff): admin signs in → creates invite → second Google account opens link → becomes debtor → can reach `/app` but is blocked from `/admin`.

# Exit criteria
- Only invited users can reach `/app/*`. Only admins can reach `/admin/*`.
- Invite tokens are single-use, time-bounded, and rejected with a clear Spanish error page when invalid.
```
