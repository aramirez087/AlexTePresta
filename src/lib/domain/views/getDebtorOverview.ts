import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'

export type DebtSummary = {
  id: string
  description: string | null
  currency: 'CRC' | 'USD'
  total_amount_minor: bigint
  total_installments: number
  installment_amount_minor: bigint
  status: string
  next_pending_installment: {
    id: string
    due_date: string
    remaining_amount_minor: bigint
    sequence_number: number
  } | null
}

export type DebtorOverview = {
  debts: DebtSummary[]
  total_owed_by_currency: { CRC: bigint; USD: bigint }
  total_paid_by_currency: { CRC: bigint; USD: bigint }
  interest_debt_balance_by_currency: { CRC: bigint; USD: bigint }
  next_installment: {
    due_date: string
    amount_minor: bigint
    currency: 'CRC' | 'USD'
  } | null
  status: 'al_dia' | 'atrasado'
}

export async function getDebtorOverview(
  adminClient: ReturnType<typeof createAdminClient>,
  debtorId: string,
): Promise<DebtorOverview> {
  const { data: debtsData } = await adminClient
    .from('debts')
    .select('id, currency, description, total_amount_minor, total_installments, installment_amount_minor, status')
    .eq('debtor_id', debtorId)
    .eq('status', 'active')

  const activeDebts = debtsData ?? []

  if (activeDebts.length === 0) {
    return {
      debts: [],
      total_owed_by_currency: { CRC: 0n, USD: 0n },
      total_paid_by_currency: { CRC: 0n, USD: 0n },
      interest_debt_balance_by_currency: { CRC: 0n, USD: 0n },
      next_installment: null,
      status: 'al_dia',
    }
  }

  const debtIds = activeDebts.map((d) => d.id)

  const { data: installmentsData } = await adminClient
    .from('installments')
    .select('id, due_date, amount_minor, remaining_amount_minor, status, sequence_number, debt_id')
    .in('debt_id', debtIds)
    .order('due_date', { ascending: true })
    .order('sequence_number', { ascending: true })

  const { data: interestDebtsData } = await adminClient
    .from('interest_debts')
    .select('id, debt_id, current_balance_minor')
    .in('debt_id', debtIds)
    .eq('is_simulated', false)
    .eq('status', 'active')

  const allInstallments = installmentsData ?? []
  const activeInterestDebts = interestDebtsData ?? []

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date())

  const totalOwed: { CRC: bigint; USD: bigint } = { CRC: 0n, USD: 0n }
  const totalPaid: { CRC: bigint; USD: bigint } = { CRC: 0n, USD: 0n }
  const interestDebtOwed: { CRC: bigint; USD: bigint } = { CRC: 0n, USD: 0n }
  let isAtrasado = false
  let nextInstallmentDate: string | null = null
  let nextInstallmentAmount: bigint | null = null
  let nextInstallmentCurrency: 'CRC' | 'USD' | null = null

  const debtMap = new Map(activeDebts.map((d) => [d.id, d]))
  const debtFirstPending = new Map<string, { id: string; due_date: string; remaining_amount_minor: number; sequence_number: number }>()

  for (const inst of allInstallments) {
    const debt = debtMap.get(inst.debt_id)
    if (!debt) continue
    const currency = debt.currency as 'CRC' | 'USD'

    const paid = BigInt(inst.amount_minor - inst.remaining_amount_minor)
    totalPaid[currency] += paid

    if (inst.status !== 'paid') {
      totalOwed[currency] += BigInt(inst.remaining_amount_minor)

      if (inst.due_date < todayStr) {
        isAtrasado = true
      }

      if (!debtFirstPending.has(inst.debt_id)) {
        debtFirstPending.set(inst.debt_id, {
          id: inst.id,
          due_date: inst.due_date,
          remaining_amount_minor: inst.remaining_amount_minor,
          sequence_number: inst.sequence_number,
        })
      }

      if (!nextInstallmentDate || inst.due_date < nextInstallmentDate) {
        nextInstallmentDate = inst.due_date
        nextInstallmentAmount = BigInt(inst.remaining_amount_minor)
        nextInstallmentCurrency = currency
      }
    }
  }

  for (const idb of activeInterestDebts) {
    const debt = debtMap.get(idb.debt_id)
    if (!debt) continue
    const currency = debt.currency as 'CRC' | 'USD'
    // boundary: DB returns number for bigint column; domain amounts < MAX_SAFE_INTEGER
    const balance = BigInt(idb.current_balance_minor)
    interestDebtOwed[currency] += balance
    totalOwed[currency] += balance
  }

  const debts: DebtSummary[] = activeDebts.map((d) => {
    const currency = d.currency as 'CRC' | 'USD'
    const firstPending = debtFirstPending.get(d.id) ?? null
    return {
      id: d.id,
      description: d.description,
      currency,
      total_amount_minor: BigInt(d.total_amount_minor),
      total_installments: d.total_installments,
      installment_amount_minor: BigInt(d.installment_amount_minor),
      status: d.status,
      next_pending_installment: firstPending
        ? {
            id: firstPending.id,
            due_date: firstPending.due_date,
            remaining_amount_minor: BigInt(firstPending.remaining_amount_minor),
            sequence_number: firstPending.sequence_number,
          }
        : null,
    }
  })

  return {
    debts,
    total_owed_by_currency: totalOwed,
    total_paid_by_currency: totalPaid,
    interest_debt_balance_by_currency: interestDebtOwed,
    next_installment:
      nextInstallmentDate && nextInstallmentAmount !== null && nextInstallmentCurrency
        ? { due_date: nextInstallmentDate, amount_minor: nextInstallmentAmount, currency: nextInstallmentCurrency }
        : null,
    status: isAtrasado ? 'atrasado' : 'al_dia',
  }
}
