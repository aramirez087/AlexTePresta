# Session 01: Architecture Charter & ADRs

Paste this into a new Claude Code session:

```md
# Mission
Audit the empty repo and produce the architecture charter, data model, payment-pipeline spec, interest model, and ADRs for AlexTePresta — without writing application code.

# Repository anchors
- /Users/aramirez/Code/AlexTePresta/ (currently only .git, .gitignore, LICENSE)
- docs/architecture/ (to create)
- docs/adr/ (to create)
- docs/roadmap/alextepresta/ (handoff target)

# Tasks
1. Confirm the repo has no application code; record this baseline in the charter.
2. Write `docs/architecture/charter.md`: vision, MVP scope (Phase 1: login + invitations + zero-rate debts + installments + payments + FIFO, no interest), Phase 2 and Phase 3 scopes, out-of-scope, target users, glossary (Debt, Installment, InterestDebt, Payment, PaymentApplication, Accrual).
3. Write `docs/architecture/data-model.md` with full ERD (Mermaid) for tables: `users`, `invites`, `debts`, `installments`, `interest_debts`, `payments`, `payment_applications`, `interest_accruals`, `settings`. Specify column types (`bigint` for amounts, `text` for currency with check constraint `CRC|USD`, status check constraints), constraints, indexes, and FK ON DELETE behavior.
4. Write `docs/architecture/payment-pipeline.md`: numbered pseudocode for FIFO application (Phase 1) and the partial-payment → interest-debt conversion (Phase 2), including transaction boundaries and `SELECT FOR UPDATE` points.
5. Write `docs/architecture/interest-model.md`: monthly compound formula, real vs simulated mode, idempotency keys for accrual cron, rounding rule (half-even to minor units).
6. Write `docs/architecture/ux-partial-payment.md`: confirmation flow for partial payments (PRD §13's riskiest UX surface). Specify Spanish copy and required visual cues.
7. Write ADRs in `docs/adr/`:
   - `0001-stack-choice.md` (Next.js App Router + Supabase + Vercel)
   - `0002-money-representation.md` (bigint minor units + decimal.js)
   - `0003-authorization-model.md` (Supabase RLS authoritative)
   - `0004-idempotent-jobs.md` (period-keyed cron jobs)

# Deliverables
- docs/architecture/charter.md
- docs/architecture/data-model.md
- docs/architecture/payment-pipeline.md
- docs/architecture/interest-model.md
- docs/architecture/ux-partial-payment.md
- docs/adr/0001-stack-choice.md, 0002-money-representation.md, 0003-authorization-model.md, 0004-idempotent-jobs.md
- docs/roadmap/alextepresta/session-01-handoff.md

# Quality gates
- No application code is written; no `package.json` is created yet.
- Every cross-doc markdown link resolves.
- Handoff names exact pinned versions (Next.js, Supabase JS) and required env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_OAUTH_*) for Session 02.

# Exit criteria
- Charter, data model, payment pipeline, interest model, UX spec, and four ADRs all exist and are internally consistent.
- Handoff lists Session 02's bootstrap steps with exact commands.
```
