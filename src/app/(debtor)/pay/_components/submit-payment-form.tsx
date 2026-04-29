'use client'
import { useAction } from 'next-safe-action/hooks'
import { useState } from 'react'
import { submitPayment } from '@/lib/domain/payments/submitPayment'

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'mb-1 block text-sm font-medium text-gray-700'

export function SubmitPaymentForm() {
  const [currency, setCurrency] = useState<'CRC' | 'USD'>('CRC')
  const [submitted, setSubmitted] = useState<string | null>(null)
  const currencySymbol = currency === 'CRC' ? '₡' : '$'

  const { execute, isPending, result } = useAction(submitPayment, {
    onSuccess: ({ data }) => {
      if (data?.paymentId) {
        setSubmitted(data.paymentId)
      }
    },
  })

  if (submitted) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-lg font-semibold text-green-800">Pago registrado correctamente</p>
        <p className="mt-2 text-sm text-green-600">
          Su pago está pendiente de aprobación por el administrador.
        </p>
        <p className="mt-1 text-xs text-gray-500">Referencia: {submitted}</p>
        <button
          onClick={() => setSubmitted(null)}
          className="mt-4 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Registrar otro pago
        </button>
      </div>
    )
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const amountInput = parseFloat(fd.get('amount') as string)
    execute({
      currency,
      amount_minor: Math.round(amountInput * 100),
      notes: (fd.get('notes') as string) || undefined,
    })
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
            <option value="CRC">CRC — Colón costarricense (₡)</option>
            <option value="USD">USD — Dólar estadounidense ($)</option>
          </select>
        </div>

        <div>
          <label htmlFor="amount" className={labelClass}>
            Monto a pagar ({currencySymbol})
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

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? 'Registrando pago…' : 'Registrar pago'}
        </button>
      </form>
    </div>
  )
}
