# AlexTePresta — UX Spec: Partial Payment Confirmation

This document specifies the user experience for partial payments — the riskiest UX surface in the application (PRD §13). A non-technical debtor must unmistakably understand that paying less than a full installment creates a new compound-interest debt before they confirm. No silent conversions are permitted.

See [payment-pipeline.md](./payment-pipeline.md) for the backend logic and [interest-model.md](./interest-model.md) for the interest formula.

---

## Guiding Principle

The partial-payment path must be **opt-in, not default**. The UI defaults to discouraging a partial amount (yellow warning) and requires an explicit confirmation step (red modal) before any conversion is committed. A debtor who confirms without reading the warning has still taken a deliberate extra action.

---

## Debtor Payment Flow

### Screen 1 — Payment Entry (`/app/pay`)

**Elements:**

- `<input type="text" inputmode="decimal">` — payment amount in the debtor's currency
- Currency selector (disabled and pre-filled if the debtor has only one active currency)
- Inline allocation preview (updates on blur or after 600 ms of inactivity)
- Submit button: `Registrar pago` (disabled until amount > 0 and preview has loaded)

**Client-side allocation preview** (read-only, no server writes):

The preview fetches the debtor's pending installments from a read-only endpoint and computes the projected FIFO allocation in the browser. This computation mirrors the server pipeline logic exactly but never commits anything.

```
Preview table columns:
  Cuota #N | Fecha vencimiento | Monto cuota | Monto a aplicar | Saldo pendiente
```

Example row (full cover):
```
Cuota #3  | 15 abr 2026  | ₡10 000,00  | ₡10 000,00  | ₡0,00
```

Example row (partial cover):
```
Cuota #4  | 15 may 2026  | ₡10 000,00  | ₡2 500,00   | ₡7 500,00 ⚠
```

---

### Partial Detection Logic (Client-Side)

Partial detection fires when **any installment in the preview would be partially covered** (applied amount > 0 but < installment amount).

When partial detection is true, **before the submit button is enabled**, a yellow warning banner appears below the preview table.

---

### Warning Banner — Partial Payment Detected

```
┌─────────────────────────────────────────────────────────────────────┐
│ ⚠  Aviso                                                            │
│                                                                     │
│  El monto ingresado no cubre completamente la cuota #N por          │
│  ₡{installment_amount}. Si continúas, la diferencia de              │
│  ₡{shortfall} quedará registrada como deuda con interés             │
│  compuesto al {rate}% anual.                                        │
└─────────────────────────────────────────────────────────────────────┘
```

**Tailwind classes:** `bg-yellow-50 border border-yellow-400 text-yellow-800 rounded-lg p-4`

**Spanish copy template:**
> **Aviso**: El monto ingresado no cubre completamente la cuota #{N} por ₡{installment_amount}. Si continúas, la diferencia de ₡{shortfall} quedará registrada como **deuda con interés compuesto** al {rate}% anual.

Variables:
- `{N}` — `installment.sequence_number`
- `{installment_amount}` — `Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC' }).format(installment.amount_minor / 100n)`
- `{shortfall}` — formatted in the same style
- `{rate}` — `(parseFloat(rate) * 100).toFixed(0)` → e.g. `"24"`

---

### Screen 2 — Confirmation Modal (Partial Only)

The confirmation modal is shown **only when partial detection is true** and the debtor taps `Registrar pago`.

```
┌─────────────────────────────────────────────────────────────────────┐
│  ¿Confirmar pago parcial?                                           │
│                                                                     │
│  Vas a registrar un pago de ₡{amount}.                              │
│                                                                     │
│  La cuota #{N} por ₡{installment_amount} no quedará totalmente      │
│  cubierta. La diferencia de ₡{shortfall} se convertirá en una      │
│  deuda con interés compuesto del {rate}% anual a partir de hoy.    │
│                                                                     │
│  ┌──────────────────────────┐   ┌──────────────────────┐           │
│  │  Confirmar pago parcial  │   │       Cancelar        │           │
│  └──────────────────────────┘   └──────────────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
```

**Modal title:** `¿Confirmar pago parcial?`

**Modal body (Spanish copy):**
> Vas a registrar un pago de ₡{amount}. La cuota #{N} por ₡{installment_amount} no quedará totalmente cubierta. La diferencia de ₡{shortfall} se convertirá en una deuda con interés compuesto del {rate}% anual a partir de hoy.

**Primary button:** `Confirmar pago parcial`
- Tailwind: `bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2 rounded-lg`

**Cancel button:** `Cancelar`
- Tailwind: `bg-white border border-gray-300 text-gray-700 font-semibold px-6 py-2 rounded-lg`

**Behavior:**
- Pressing **Cancelar** or clicking outside the modal dismisses it and returns to Screen 1. No server request is made.
- Pressing **Confirmar pago parcial** submits the payment to the server action. The modal shows a loading spinner while awaiting the response.
- On success: redirect to `/app/payments/{id}` (payment detail / confirmation receipt).
- On server error: display inline error message inside the modal. Do not dismiss.

---

## Admin Direct-Register Path (`/admin/debtors/[id]/register-payment`)

When the admin registers a payment on behalf of a debtor, the same warning banner and confirmation modal are shown if the allocation preview detects a partial cover. There are no silent conversions — even admin-registered payments require the explicit confirmation step.

**Admin-specific copy adjustments:**

Warning banner:
> **Aviso**: El monto ingresado no cubre completamente la cuota #{N} por ₡{installment_amount}. Si continúas, la diferencia de ₡{shortfall} quedará registrada como deuda con interés compuesto al {rate}% anual en la cuenta de {debtor_name}.

Confirmation modal body:
> Vas a registrar un pago de ₡{amount} para {debtor_name}. La cuota #{N} por ₡{installment_amount} no quedará totalmente cubierta. La diferencia de ₡{shortfall} se convertirá en una deuda con interés compuesto del {rate}% anual a partir de hoy.

---

## Post-Approval State (Admin Timeline View)

After a partial payment is approved and converted, the debtor's account timeline gains two new events:

### Event: `installment_converted`

| Field | Value |
|-------|-------|
| Label | `Cuota #N convertida a deuda con interés` |
| Timestamp | `payment.applied_at` |
| Badge | `Convertida` — Tailwind: `bg-orange-100 text-orange-800 text-xs font-medium px-2.5 py-0.5 rounded` |
| Detail | Shows the partial payment amount applied and the shortfall that was converted |

### Event: `interest_debt_created`

| Field | Value |
|-------|-------|
| Label | `Nueva deuda de interés: ₡{principal} al {rate}% anual` |
| Timestamp | `interest_debts.created_at` |
| Badge | `Interés` — Tailwind: `bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded` |
| Detail | Shows principal amount, annual rate, and a link to the interest debt detail |

### Installment Row Badge

In the installment schedule table, a converted installment shows:

```
Cuota #N  | 15 may 2026  | ₡10 000,00  | Convertida [badge]
```

Badge: Tailwind `bg-orange-100 text-orange-800 text-xs font-medium px-2.5 py-0.5 rounded`

---

## Interest Debt Row (New Section in Timeline)

When an `interest_debts` row exists for a debtor, it appears in a dedicated section titled **Deudas con interés** below the installment schedule. Each row shows:

| Column | Content |
|--------|---------|
| Origen | `Cuota #N` (link to source installment) |
| Capital original | `₡{principal_minor}` |
| Saldo actual | `₡{current_balance_minor}` |
| Tasa anual | `{rate}%` |
| Estado | `Activa` / `Liquidada` badge |

---

## Visual Color System Summary

| Scenario | Background | Border | Text |
|----------|-----------|--------|------|
| Partial payment warning banner | `bg-yellow-50` | `border-yellow-400` | `text-yellow-800` |
| Interest conversion notice | `bg-red-50` | `border-red-400` | `text-red-800` |
| Confirmation modal primary button | `bg-red-600` | — | `text-white` |
| `Convertida` installment badge | `bg-orange-100` | — | `text-orange-800` |
| `Interés` timeline badge | `bg-red-100` | — | `text-red-800` |
| Simulation mode app banner (Phase 3) | `bg-amber-100` | `border-amber-400` | `text-amber-900` |

---

## Accessibility Requirements

- The confirmation modal must trap focus while open (`aria-modal="true"`, `role="dialog"`).
- The warning banner must be announced by screen readers (`role="alert"` or `aria-live="polite"`).
- The `Confirmar pago parcial` button must have `aria-describedby` pointing to the modal body paragraph.
- All monetary amounts must use `aria-label` with the full currency name (e.g., `aria-label="diez mil colones"`).
- Color alone must not be the sole indicator of partial-payment status — the warning icon (`⚠`) and text copy carry the information independent of color.
