'use client'

import { useState } from 'react'
import Decimal from 'decimal.js'
import { accrueOne } from '@/lib/domain/interest/accrueOne'
import { formatMoney } from '@/lib/format/money'

type InterestDebtInput = {
  id: string
  current_balance_minor: number
  interest_rate: string
  currency: 'CRC' | 'USD'
}

type Props = {
  realDebts: InterestDebtInput[]
  simulatedDebts: InterestDebtInput[]
}

type ProjectionRow = {
  month: number
  balance_minor: bigint
  accrued_minor: bigint
}

function projectTrajectory(
  openingBalance: bigint,
  annualRate: string,
  extraMonthlyMinor: bigint,
  maxMonths = 120,
): ProjectionRow[] {
  const monthlyRate = new Decimal(annualRate).div(12)
  const rows: ProjectionRow[] = []
  let balance = openingBalance

  for (let month = 1; month <= maxMonths; month++) {
    const { accrued_minor, closing_minor } = accrueOne(balance, monthlyRate)
    const afterPayment = closing_minor > extraMonthlyMinor ? closing_minor - extraMonthlyMinor : 0n
    rows.push({ month, balance_minor: afterPayment, accrued_minor })
    balance = afterPayment
    if (balance === 0n) break
  }

  return rows
}

function DebtProjectionTable({
  debt,
  extraMinor,
  label,
  colorClass,
}: {
  debt: InterestDebtInput
  extraMinor: bigint
  label: string
  colorClass: string
}) {
  const rows = projectTrajectory(BigInt(debt.current_balance_minor), debt.interest_rate, extraMinor)
  const monthsToPayoff = rows.find((r) => r.balance_minor === 0n)?.month ?? null

  return (
    <div className={`rounded-xl border p-4 ${colorClass}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">
          {label} · Tasa: {(parseFloat(debt.interest_rate) * 100).toFixed(1)}%
        </span>
        {monthsToPayoff !== null ? (
          <span className="text-sm">
            Saldada en {monthsToPayoff} mes{monthsToPayoff === 1 ? '' : 'es'}
          </span>
        ) : (
          <span className="text-sm text-red-600">No saldada en 120 meses</span>
        )}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-1 pr-3">Mes</th>
            <th className="py-1 pr-3">Interés</th>
            <th className="py-1">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((row) => (
            <tr key={row.month} className="border-t border-gray-100">
              <td className="py-1 pr-3 text-gray-600">{row.month}</td>
              <td className="py-1 pr-3">{formatMoney(row.accrued_minor, debt.currency)}</td>
              <td className="py-1 font-medium">{formatMoney(row.balance_minor, debt.currency)}</td>
            </tr>
          ))}
          {rows.length > 12 && (
            <tr>
              <td colSpan={3} className="py-1 text-gray-400">
                … {rows.length - 12} meses más
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export function AdminScenarioProjector({ realDebts, simulatedDebts }: Props) {
  const [extraInput, setExtraInput] = useState('')

  const extraMinor = (() => {
    const n = parseInt(extraInput, 10)
    return !isNaN(n) && n > 0 ? BigInt(n) : 0n
  })()

  const hasData = realDebts.length > 0 || simulatedDebts.length > 0

  if (!hasData) {
    return (
      <p className="text-sm text-gray-400">No hay deudas de interés activas para proyectar.</p>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="extra-payment" className="block text-sm font-medium text-gray-700">
          Pago extra mensual (en céntimos / centavos)
        </label>
        <input
          id="extra-payment"
          type="number"
          min="0"
          value={extraInput}
          onChange={(e) => setExtraInput(e.target.value)}
          className="mt-1 block w-48 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="0"
        />
      </div>

      {realDebts.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-gray-900">Deudas reales</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {realDebts.map((debt) => (
              <DebtProjectionTable
                key={debt.id}
                debt={debt}
                extraMinor={extraMinor}
                label="Real"
                colorClass="border-gray-200 bg-white"
              />
            ))}
          </div>
        </div>
      )}

      {simulatedDebts.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-amber-800">Deudas simuladas</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {simulatedDebts.map((debt) => (
              <DebtProjectionTable
                key={debt.id}
                debt={debt}
                extraMinor={extraMinor}
                label="Simulado"
                colorClass="border-amber-200 bg-amber-50"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
