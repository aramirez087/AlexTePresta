# Session 06: Debtor and Admin Views with Account-Statement Timeline

Paste this into a new Claude Code session:

```md
# Continuity
Continue from Session 05 artifacts.

# Mission
Build the debtor's bank-style "estado de cuenta" timeline view and the admin's debtor overview, completing the Phase 1 user-facing surface.

# Repository anchors
- src/lib/domain/debts/, src/lib/domain/payments/
- src/app/(debtor)/, src/app/admin/, src/app/admin/debtors/[id]/ (to expand)
- src/components/timeline/, src/lib/format/, src/lib/domain/views/ (to create)

# Tasks
1. Implement `src/lib/format/money.ts`: `formatMoney(amountMinor: bigint, currency: 'CRC' | 'USD'): string` using `Intl.NumberFormat('es-CR' | 'en-US')` and the appropriate minor-unit divisor. 100% line coverage including zero, large values, and negative amounts (defensive — should never happen but tested).
2. Implement `src/lib/format/date.ts`: `formatDate(d: Date): string` (Spanish, America/Costa_Rica), `daysUntil(d: Date): number`. Test across daylight saving / timezone edge cases.
3. Implement `src/lib/domain/views/getDebtorOverview.ts`: per-debtor summary returning `{ debts: [...], total_owed_by_currency: { CRC, USD }, total_paid_by_currency, next_installment, status: 'al_dia' | 'atrasado' }`. Status is 'atrasado' if any pending installment has `due_date < today`.
4. Implement `src/lib/domain/views/getDebtTimeline.ts`: returns a chronologically ordered array of typed events: `{ kind: 'installment_due' | 'payment_received' | 'payment_application', date, amount_minor, currency, status, ref_id }`. Pure function over fetched rows; tested independently.
5. Build `src/components/timeline/DebtTimeline.tsx`: vertical list, accessible (semantic `<ol>`, aria-labels in Spanish), each event distinguished by icon + status color. No external icon libs; inline SVG.
6. Build `src/app/(debtor)/page.tsx` (debtor home): summary cards (saldo total, próxima cuota, estado) + timeline of active debt(s). Empty state when no debts.
7. Build `src/app/admin/page.tsx` (admin home): list of debtors with totals per currency, status badges, alert counts (overdue installments, pending payment approvals). Each row links to `/admin/debtors/[id]`.
8. Build `src/app/admin/debtors/[id]/page.tsx`: full debtor detail with timeline (admin sees everything).
9. Snapshot tests for `DebtTimeline` covering: all-paid, partially-paid (Phase 1: installment `pending` with reduced remaining), overdue, future installments. Component tests assert Spanish labels.

# Deliverables
- src/lib/format/{money,date}.ts + tests
- src/lib/domain/views/{getDebtorOverview,getDebtTimeline}.ts + tests
- src/components/timeline/DebtTimeline.tsx + tests
- src/app/(debtor)/page.tsx, src/app/admin/page.tsx, src/app/admin/debtors/[id]/page.tsx
- docs/roadmap/alextepresta/session-06-handoff.md

# Quality gates
- `npm run check`
- `npx vitest run`
- Manual smoke (record in handoff): debtor sees timeline; admin sees all debtors with accurate alert counts that update after approving a pending payment.

# Exit criteria
- A debtor with two debts and three payments sees a chronologically correct, accessible Spanish-labeled timeline.
- Admin home shows accurate alert counts; counts decrement after approval without manual refresh (server action revalidates).
- All money is formatted via `formatMoney`; no raw `bigint` rendered to the UI anywhere.
```
