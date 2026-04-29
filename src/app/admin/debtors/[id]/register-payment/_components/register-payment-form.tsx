'use client'
import { useAction } from 'next-safe-action/hooks'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { registerPaymentDirect } from '@/lib/domain/payments/registerPaymentDirect'

type ActiveDebt = { id: string; currency: string }

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'mb-1 block text-sm font-medium text-gray-700'

export function RegisterPaymentForm({
  debtorId,
  activeDebts,
}: {
  debtorId: string
  activeDebts: ActiveDebt[]
}) {
  const router = useRouter()
  const availableCurrencies = [...new Set(activeDebts.map((d) => d.currency))] as ('CRC' | 'USD')[]
  const [currency, setCurrency] = useState<'CRC' | 'USD'>(availableCurrencies[0] ?? 'CRC')
  const currencySymbol = currency === 'CRC' ? '₡' : '$'

  const { execute, isPending, result } = useAction(registerPaymentDirect, {
    onSuccess: () => router.push('/admin/payments'),
  })

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const amountInput = parseFloat(fd.get('amount') as string)
    execute({
      debtor_id: debtorId,
      currency,
      amount_minor: Math.round(amountInput * 100),
      notes: (fd.get('notes') as string) || undefined,
    })
  }

  if (availableCurrencies.length === 0) {
    return (
      <p className="text-sm text-amber-600">
        Este deudor no tiene deudas activas. Cree una deuda primero.
      </p>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="currency" className={labelClass}>
            Moneda
          </label>
          <select
            id="currency"
            name="currency"
            required
            value={currency}
            onChange={(e) => setCurrency(e.target.value as 'CRC' | 'USD')}
            className={inputClass}
          >
            {availableCurrencies.map((c) => (
              <option key={c} value={c}>
                {c === 'CRC' ? 'CRC — Colón costarricense (₡)' : 'USD — Dólar estadounidense ($)'}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="amount" className={labelClass}>
            Monto ({currencySymbol})
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            required
            min="0.01"
            step="0.01"
            placeholder="1478.75"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="notes" className={labelClass}>
            Notas (opcional)
          </label>
          <textarea
            id="notes"
            name="notes"
            maxLength={500}
            rows={3}
            placeholder="Transferencia SINPE #12345"
            className={inputClass}
          />
        </div>

        {result?.serverError && (
          <p className="text-sm text-red-600">{result.serverError}</p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? 'Registrando…' : 'Registrar y aplicar pago'}
          </button>
        </div>
      </form>
    </div>
  )
}
