import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'

export type GenerateParams = {
  totalInstallments: number
  installmentAmountMinor: bigint
  dueDay: number
  startMonth: string
}

type InstallmentInsertRow = {
  debt_id: string
  sequence_number: number
  due_date: string
  amount_minor: number
  remaining_amount_minor: number
  status: 'pending'
}

export function computeDueDate(startMonth: string, dueDay: number, sequenceNumber: number): string {
  const [y, m] = startMonth.split('-').map(Number)
  const zeroIndexedTotal = y * 12 + (m - 1) + (sequenceNumber - 1)
  const year = Math.floor(zeroIndexedTotal / 12)
  const month = (zeroIndexedTotal % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
}

export function computeInstallments(debtId: string, params: GenerateParams): InstallmentInsertRow[] {
  const { totalInstallments, installmentAmountMinor, dueDay, startMonth } = params
  const rows: InstallmentInsertRow[] = []
  for (let seq = 1; seq <= totalInstallments; seq++) {
    rows.push({
      debt_id: debtId,
      sequence_number: seq,
      due_date: computeDueDate(startMonth, dueDay, seq),
      // boundary: bigint→number for Supabase insert; safe because Zod constrains amount < MAX_SAFE_INTEGER
      amount_minor: Number(installmentAmountMinor),
      remaining_amount_minor: Number(installmentAmountMinor),
      status: 'pending',
    })
  }
  return rows
}

export async function generateForDebt(
  adminClient: ReturnType<typeof createAdminClient>,
  debtId: string,
  params: GenerateParams,
): Promise<number> {
  const rows = computeInstallments(debtId, params)
  const { error } = await adminClient
    .from('installments')
    .upsert(rows, { onConflict: 'debt_id,sequence_number', ignoreDuplicates: true })
  if (error) throw new Error(`Error al generar cuotas: ${error.message}`)
  return rows.length
}
