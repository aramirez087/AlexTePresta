# Session 04: Debt Creation and Installment Generation (Phase 1)

Paste this into a new Claude Code session:

```md
# Continuity
Continue from Session 03 artifacts.

# Mission
Admin creates a zero-rate debt for a debtor and the full installment schedule is generated atomically with idempotent re-generation guarantees.

# Repository anchors
- supabase/migrations/0001_init.sql (debts, installments)
- docs/architecture/payment-pipeline.md, docs/architecture/data-model.md
- src/lib/auth/session.ts
- src/lib/domain/debts/, src/lib/domain/installments/ (to create)
- src/app/admin/debts/ (to create)
- src/app/api/cron/generate-installments/route.ts (to create)

# Tasks
1. Implement `src/lib/domain/debts/createDebt.ts` server action. Validates with zod: `debtor_id` (uuid), `total_amount_minor` (bigint > 0), `total_installments` (int 1..120), `installment_amount_minor` (bigint > 0), `due_day` (int 1..28 — clamp prevents Feb edge case), `currency` ('CRC'|'USD'), `start_month` (ISO 'YYYY-MM'). Asserts the rounding invariant `installment_amount * total_installments` is within ±total_installments minor units of `total_amount` (one minor unit per installment for residual rounding). Wraps debt insert + installment generation in a single transaction. Requires admin via `requireAdmin()`.
2. Implement `src/lib/domain/installments/generateForDebt.ts`: generates all rows up-front with `sequence_number` 1..N, `due_date` = `due_day` of `start_month + (n-1) months`, `amount` = installment_amount, `remaining_amount` = installment_amount, `status='pending'`. Idempotent on `(debt_id, sequence_number)` — second invocation is a no-op.
3. Author migration `supabase/migrations/0003_unique_installment_seq.sql` adding `UNIQUE (debt_id, sequence_number)`.
4. Build `/admin/debts/new` (server component shell + client form using the server action). Currency picker is required; due_day picker capped at 28 with help text.
5. Build `/admin/debts/[id]` detail page: installment schedule table with status, due_date, amount, remaining; running totals (paid, pending).
6. Implement Vercel cron stub `src/app/api/cron/generate-installments/route.ts` authenticated via `CRON_SECRET` header. Phase 1 schedule is fully generated at debt creation, so this route currently scans for any debts missing installments and back-fills them (defensive idempotency). It logs and returns 200 even when there is nothing to do.
7. Tests: rounding tolerance (591500 / 4 with 147875 installments), due-day generation across year boundary (Nov 25 → Dec 25 → Jan 25), idempotent re-generation does not create duplicates, non-admin caller is rejected, currency mismatch on update is rejected.

# Deliverables
- src/lib/domain/debts/createDebt.ts + tests
- src/lib/domain/installments/generateForDebt.ts + tests
- src/app/admin/debts/new/page.tsx, src/app/admin/debts/[id]/page.tsx
- src/app/api/cron/generate-installments/route.ts
- supabase/migrations/0003_unique_installment_seq.sql
- docs/roadmap/alextepresta/session-04-handoff.md

# Quality gates
- `npm run check`
- `npx vitest run` (must include createDebt + generateForDebt suites)

# Exit criteria
- Admin creates a debt with N installments; DB has exactly N rows with monotonically increasing due_dates and `status='pending'`.
- Re-running generation (manually or via cron) does not duplicate or modify existing rows.
- The PRD example (Universidad Fidelitas, ₡591,500, 4 installments of ₡147,875, day 25) is covered by an end-to-end test.
```
