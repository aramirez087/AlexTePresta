'use client'
import { useAction } from 'next-safe-action/hooks'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createDebt } from '@/lib/domain/debts/createDebt'

type Debtor = { id: string; email: string }

export function CreateDebtForm({ debtors }: { debtors: Debtor[] }) {
  const router = useRouter()
  const [currency, setCurrency] = useState<'CRC' | 'USD'>('CRC')
  const currencySymbol = currency === 'CRC' ? '₡' : '$'

  const { execute, isPending, result } = useAction(createDebt, {
    onSuccess: ({ data }) => {
      if (data?.debtId) {
        router.push(`/admin/debts/${data.debtId}`)
      }
    },
  })

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)

    const totalInput = parseFloat(fd.get('total_amount') as string)
    const installInput = parseFloat(fd.get('installment_amount') as string)

    execute({
      debtor_id: fd.get('debtor_id') as string,
      currency,
      total_amount_minor: Math.round(totalInput * 100),
      total_installments: parseInt(fd.get('total_installments') as string, 10),
      installment_amount_minor: Math.round(installInput * 100),
      due_day: parseInt(fd.get('due_day') as string, 10),
      start_month: fd.get('start_month') as string,
      description: (fd.get('description') as string) || undefined,
    })
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'mb-1 block text-sm font-medium text-gray-700'

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="debtor_id" className={labelClass}>
            Deudor
          </label>
          <select id="debtor_id" name="debtor_id" required className={inputClass}>
            <option value="">Seleccionar deudor…</option>
            {debtors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.email}
              </option>
            ))}
          </select>
        </div>

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
          <label htmlFor="total_amount" className={labelClass}>
            Monto total ({currencySymbol})
          </label>
          <input
            id="total_amount"
            name="total_amount"
            type="number"
            required
            min="0.01"
            step="0.01"
            placeholder="5915.00"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="total_installments" className={labelClass}>
            Número de cuotas
          </label>
          <input
            id="total_installments"
            name="total_installments"
            type="number"
            required
            min="1"
            max="120"
            placeholder="4"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="installment_amount" className={labelClass}>
            Monto por cuota ({currencySymbol})
          </label>
          <input
            id="installment_amount"
            name="installment_amount"
            type="number"
            required
            min="0.01"
            step="0.01"
            placeholder="1478.75"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="due_day" className={labelClass}>
            Día de vencimiento
          </label>
          <input
            id="due_day"
            name="due_day"
            type="number"
            required
            min="1"
            max="28"
            placeholder="25"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-gray-500">
            El día máximo es 28 para evitar problemas con febrero.
          </p>
        </div>

        <div>
          <label htmlFor="start_month" className={labelClass}>
            Mes de inicio
          </label>
          <input
            id="start_month"
            name="start_month"
            type="month"
            required
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="description" className={labelClass}>
            Descripción (opcional)
          </label>
          <textarea
            id="description"
            name="description"
            maxLength={500}
            rows={3}
            placeholder="Universidad Fidelitas — préstamo matrícula 2024"
            className={inputClass}
          />
        </div>

        {result?.serverError && (
          <p className="text-sm text-red-600">{result.serverError}</p>
        )}

        <button
          type="submit"
          disabled={isPending || debtors.length === 0}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? 'Creando deuda…' : 'Crear deuda'}
        </button>

        {debtors.length === 0 && (
          <p className="text-sm text-amber-600">
            No hay deudores registrados. Invite a un usuario primero.
          </p>
        )}
      </form>
    </div>
  )
}
