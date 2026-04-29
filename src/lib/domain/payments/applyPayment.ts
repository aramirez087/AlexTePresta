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
  return data as ApplyPaymentResult
}
