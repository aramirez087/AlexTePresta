'use client'
import { useAction } from 'next-safe-action/hooks'
import { useRouter } from 'next/navigation'
import { approvePayment } from '@/lib/domain/payments/approvePayment'

export function ApproveButton({ paymentId }: { paymentId: string }) {
  const router = useRouter()
  const { execute, isPending, result } = useAction(approvePayment, {
    onSuccess: () => router.refresh(),
  })

  return (
    <div>
      <button
        onClick={() => execute({ payment_id: paymentId })}
        disabled={isPending}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {isPending ? 'Aprobando…' : 'Aprobar'}
      </button>
      {result?.serverError && (
        <p className="mt-1 text-xs text-red-600">{result.serverError}</p>
      )}
    </div>
  )
}
