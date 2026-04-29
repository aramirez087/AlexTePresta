import React from 'react'
import { type TimelineEvent, type TimelineEventKind } from '@/lib/domain/views/getDebtTimeline'
import { formatMoney } from '@/lib/format/money'
import { formatDate } from '@/lib/format/date'

const EVENT_LABELS: Record<TimelineEventKind, string> = {
  installment_due: 'Cuota',
  payment_received: 'Pago recibido',
  payment_application: 'Aplicación de pago',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  overdue: 'Vencida',
  converted: 'Convertida',
  approved: 'Aprobado',
  applied: 'Aplicado',
}

function statusColorClass(status: string): string {
  switch (status) {
    case 'paid':
    case 'approved':
    case 'applied':
      return 'text-green-600'
    case 'overdue':
      return 'text-red-600'
    case 'pending':
      return 'text-amber-600'
    default:
      return 'text-gray-400'
  }
}

function iconBgClass(status: string): string {
  switch (status) {
    case 'paid':
    case 'approved':
    case 'applied':
      return 'bg-green-100'
    case 'overdue':
      return 'bg-red-100'
    case 'pending':
      return 'bg-amber-100'
    default:
      return 'bg-gray-100'
  }
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className ?? 'h-4 w-4'}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function ArrowDownIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className ?? 'h-4 w-4'}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className ?? 'h-4 w-4'}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function EventIcon({ kind, status }: { kind: TimelineEventKind; status: string }) {
  const colorClass = statusColorClass(status)
  const bgClass = iconBgClass(status)
  return (
    <span className={`flex h-8 w-8 items-center justify-center rounded-full ${bgClass} ${colorClass}`}>
      {kind === 'installment_due' && <CalendarIcon className="h-4 w-4" />}
      {kind === 'payment_received' && <ArrowDownIcon className="h-4 w-4" />}
      {kind === 'payment_application' && <CheckCircleIcon className="h-4 w-4" />}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status
  const colorClass = statusColorClass(status)
  return (
    <span className={`mt-1 inline-block text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  )
}

type Props = {
  events: TimelineEvent[]
  emptyMessage?: string
}

export function DebtTimeline({
  events,
  emptyMessage = 'Sin movimientos registrados.',
}: Props) {
  if (events.length === 0) {
    return (
      <section aria-label="Historial de movimientos">
        <p className="text-sm text-gray-400">{emptyMessage}</p>
      </section>
    )
  }

  return (
    <section aria-label="Historial de movimientos">
      <ol className="space-y-0">
        {events.map((event, idx) => (
          <li key={event.ref_id} className="flex gap-4 py-3">
            <div className="flex flex-col items-center">
              <EventIcon kind={event.kind} status={event.status} />
              {idx < events.length - 1 && (
                <div className="mt-1 w-px flex-1 bg-gray-200" aria-hidden="true" />
              )}
            </div>
            <div className="flex-1 pb-4">
              <p className="text-sm font-medium text-gray-900">
                {EVENT_LABELS[event.kind]}
              </p>
              <p className="text-xs text-gray-500">{formatDate(event.date)}</p>
              <p className="mt-1 font-semibold text-gray-900">
                {formatMoney(event.amount_minor, event.currency)}
              </p>
              <StatusBadge status={event.status} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
