import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'

export type ApplicationResult = {
  target_id: string
  target_type: 'installment' | 'interest_debt'
  applied_amount_minor: number
}

export type ApplyPaymentResult = {
  applications: ApplicationResult[]
  leftover_minor: 0
}

async function resolveSimulatedRate(
  adminClient: ReturnType<typeof createAdminClient>,
  debtorId: string,
  fallbackRate: string,
): Promise<string> {
  const { data: override } = await adminClient
    .from('user_simulation_overrides')
    .select('simulated_annual_rate')
    .eq('user_id', debtorId)
    .maybeSingle()

  if (override) {
    return override.simulated_annual_rate
  }

  const { data: setting } = await adminClient
    .from('settings')
    .select('value')
    .eq('key', 'simulated_annual_rate')
    .maybeSingle()

  if (setting) {
    // boundary: JSONB value — string JSON becomes JS string after PostgREST parse
    return typeof setting.value === 'string' ? setting.value : String(setting.value)
  }

  return fallbackRate
}

export async function applyPayment(
  adminClient: ReturnType<typeof createAdminClient>,
  paymentId: string,
): Promise<ApplyPaymentResult> {
  const { data, error } = await adminClient.rpc('apply_payment', {
    p_payment_id: paymentId,
  })

  if (error) {
    if (error.message.includes('PaymentExcessError')) {
      throw new Error('El monto del pago excede las obligaciones pendientes')
    }
    if (error.message.includes('PaymentAlreadyAppliedError')) {
      throw new Error('Este pago ya fue procesado')
    }
    if (error.message.includes('PaymentNotFoundError')) {
      throw new Error('Pago no encontrado')
    }
    throw new Error(`Error al aplicar pago: ${error.message}`)
  }

  // boundary: RPC returns Json (unknown); function contract guarantees ApplyPaymentResult shape
  const result = data as ApplyPaymentResult

  const installmentIds = result.applications
    .filter((a) => a.target_type === 'installment')
    .map((a) => a.target_id)

  if (installmentIds.length > 0) {
    const { data: newRealDebts } = await adminClient
      .from('interest_debts')
      .select('id, debt_id, source_installment_id, principal_minor, interest_rate')
      .in('source_installment_id', installmentIds)
      .eq('is_simulated', false)
      .is('mirror_of', null)

    if (newRealDebts && newRealDebts.length > 0) {
      const { data: paymentRow } = await adminClient
        .from('payments')
        .select('debtor_id')
        .eq('id', paymentId)
        .single()

      // boundary: payment record shape from PostgREST partial select
      const debtorId = (paymentRow as { debtor_id: string } | null)?.debtor_id

      for (const realDebt of newRealDebts) {
        const { data: existingMirror } = await adminClient
          .from('interest_debts')
          .select('id')
          .eq('mirror_of', realDebt.id)
          .maybeSingle()

        if (existingMirror) continue

        const rd = realDebt as {
          id: string
          debt_id: string
          source_installment_id: string | null
          principal_minor: number
          interest_rate: string
        }

        const simulatedRate = debtorId
          ? await resolveSimulatedRate(adminClient, debtorId, rd.interest_rate)
          : rd.interest_rate

        const { error: mirrorError } = await adminClient.from('interest_debts').insert({
          debt_id: rd.debt_id,
          source_installment_id: rd.source_installment_id,
          principal_minor: rd.principal_minor,
          current_balance_minor: rd.principal_minor,
          interest_rate: simulatedRate,
          is_simulated: true,
          mirror_of: rd.id,
        })

        if (mirrorError) {
          // Non-fatal: real payment already applied; log and continue
          // boundary: error shape from Supabase PostgREST response
          console.error(`Failed to create simulated mirror for ${rd.id}: ${mirrorError.message}`)
        }
      }
    }
  }

  return result
}
