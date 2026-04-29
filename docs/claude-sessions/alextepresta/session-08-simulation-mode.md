# Session 08: Phase 3 — Simulation Mode

Paste this into a new Claude Code session:

```md
# Continuity
Continue from Session 07 artifacts.

# Mission
Add a parallel "simulado" interest track that computes alongside real interest but never affects what the debtor actually owes; expose a clearly-labeled toggle and scenario projector.

# Repository anchors
- src/lib/domain/payments/applyPayment.ts (to extend)
- src/lib/domain/interest/{accrueOne,runMonthlyAccrual}.ts (to extend)
- src/components/timeline/DebtTimeline.tsx, src/lib/domain/views/getDebtorOverview.ts
- src/app/(debtor)/scenarios/, src/app/admin/debtors/[id]/scenarios/ (to create)
- supabase/migrations/0006_simulation_settings.sql, 0007_mirror_of.sql, 0008_accrual_mode.sql (to create)

# Tasks
1. Migration `0006_simulation_settings.sql`: extend `settings` with `simulated_annual_rate` (default same as real) and per-user override table `user_simulation_overrides(user_id pk, simulated_annual_rate)`.
2. Migration `0007_mirror_of.sql`: add `interest_debts.mirror_of uuid REFERENCES interest_debts(id)` nullable, `INDEX (mirror_of)`. A simulated interest_debt's `mirror_of` points at its real twin.
3. Migration `0008_accrual_mode.sql`: add `interest_accruals.mode text CHECK (mode IN ('real','simulated'))`. Backfill existing rows to 'real'. Drop and recreate the unique index as `(interest_debt_id, period, mode)`.
4. Extend `applyPayment.ts`: whenever a real interest_debt is created via partial-pay conversion, also create a parallel `interest_debts` row with `is_simulated=true`, same `principal` and `source_installment_id`, `interest_rate` from `simulated_annual_rate` (per-user override → global → real fallback), and `mirror_of` pointing at the real row. Real-payment FIFO must continue to ignore `is_simulated=true` rows.
5. Extend `runMonthlyAccrual.ts` to accept `mode: 'real' | 'simulated'`. The Vercel cron runs both modes sequentially; each mode writes accrual rows tagged with its mode.
6. Update `getDebtorOverview` to expose two separate totals: `real_balance_by_currency` and `simulated_balance_by_currency`. Never sum across modes.
7. UI: add a "Modo simulación" toggle on `/app` (debtor home) and `/admin/debtors/[id]`. When active, the page is wrapped in an amber banner with the Spanish label "Escenario simulado — no afecta lo que debes". The toggle is sticky in URL search params (`?mode=simulada`) for shareability and avoids any DB writes.
8. Build `src/app/(debtor)/scenarios/page.tsx` and `src/app/admin/debtors/[id]/scenarios/page.tsx`: read-only projection accepting hypothetical extra payment amounts and dates, computing simulated trajectory client-side using the shared `accrueOne` function. No DB writes; pure presentation.
9. Tests: real and simulated balances diverge when rates differ (e.g., real 24%, simulated 36%). Toggling the UI mode never produces a DB write (verify by snapshotting tables before/after). Simulated interest_debts are excluded from real-payment FIFO. Accrual idempotency holds independently per mode.

# Deliverables
- supabase/migrations/0006_simulation_settings.sql, 0007_mirror_of.sql, 0008_accrual_mode.sql
- Updated src/lib/domain/payments/applyPayment.ts + tests
- Updated src/lib/domain/interest/runMonthlyAccrual.ts + tests
- Updated src/lib/domain/views/getDebtorOverview.ts + tests
- Updated src/components/timeline/DebtTimeline.tsx with simulation styling + tests
- src/app/(debtor)/scenarios/page.tsx, src/app/admin/debtors/[id]/scenarios/page.tsx
- docs/roadmap/alextepresta/session-08-handoff.md

# Quality gates
- `npm run check`
- `npx vitest run`

# Exit criteria
- A real partial-payment conversion creates exactly one real and one simulated interest_debt, linked via `mirror_of`.
- Simulated balance changes never affect any "owed" figure shown to debtor or admin.
- Simulation mode is visually unmistakable: amber banner + Spanish label "Escenario simulado".
```
