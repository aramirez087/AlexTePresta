# UX — Partial Payment Flow

Partial payments are the riskiest UX surface in AlexTePresta. A non-technical debtor must understand that paying less than a full installment amount creates a new compound-interest debt. The UI must make this **unmistakable before the user confirms**.

## Debtor Entry Screen (`/app/pay`)

- Amount input field (numeric, minor-unit-aware display)
- Currency selector (disabled if debtor has only one active currency)
- As the debtor types, a client-side preview computes projected allocation against pending installments — read-only calculation, no server writes

## Allocation Preview

Shown inline, updates on blur. Displays a table of installments that will be affected:

```
Cuota #1 — ₡12,500.00 cubierto de ₡15,000.00
Cuota #2 — ₡0.00 cubierto de ₡15,000.00
```

If the amount is insufficient to fully cover any single installment, a yellow warning banner appears:

> **Aviso**: El monto ingresado no cubre completamente ninguna cuota. Si continúas, la diferencia de ₡{shortfall} quedará registrada como **deuda con interés compuesto** al {rate}% anual.

## Confirmation Modal (Shown Only When Partial Detection Is True)

- **Title**: `¿Confirmar pago parcial?`
- **Body**: `Vas a registrar un pago de ₡{amount}. La cuota #{N} por ₡{installment_amount} no quedará totalmente cubierta. La diferencia de ₡{shortfall} se convertirá en una deuda con interés compuesto del {rate}% anual a partir de hoy.`
- **Primary button**: `Confirmar pago parcial` — red/destructive styling
- **Cancel button**: `Cancelar` — neutral styling

## Required Visual Cues

| Element | Tailwind Classes |
|---------|-----------------|
| Partial-payment warning banner | `bg-yellow-50 border-yellow-400 text-yellow-800` |
| Interest conversion notice | `bg-red-50 border-red-400 text-red-800` |
| Confirmation modal primary action | `bg-red-600 text-white` |
| Installment badge after conversion (admin view) | `Convertida` in orange |

## Admin Direct-Register Path (`/admin/debtors/[id]/register-payment`)

When an admin registers a payment directly that results in a partial installment, the same Spanish warning is shown before the admin submits. No silent conversions — the admin sees the same confirmation modal as the debtor.

## Post-Approval State

After an admin approves a payment that caused a partial conversion, the debtor's timeline gains two new events:

- `kind: 'installment_converted'` — label: `Cuota #N convertida a deuda con interés`
- `kind: 'interest_debt_created'` — label: `Nueva deuda de interés: ₡{principal} al {rate}% anual`

Both events appear in chronological order in the account statement.
