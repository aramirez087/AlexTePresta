export type TimelineEventKind =
  | 'installment_due'
  | 'payment_received'
  | 'payment_application'

export type TimelineEvent = {
  kind: TimelineEventKind
  date: Date
  amount_minor: bigint
  currency: 'CRC' | 'USD'
  status: string
  ref_id: string
  meta?: Record<string, unknown>
}

type InstallmentRow = {
  id: string
  due_date: string
  amount_minor: number
  remaining_amount_minor: number
  status: string
  sequence_number: number
}

type PaymentRow = {
  id: string
  created_at: string
  applied_at: string | null
  amount_minor: number
  currency: string
  status: string
  notes: string | null
}

type ApplicationRow = {
  id: string
  payment_id: string
  target_id: string
  applied_amount_minor: number
  created_at: string
}

export type GetDebtTimelineParams = {
  installments: InstallmentRow[]
  payments: PaymentRow[]
  applications: ApplicationRow[]
  currency: 'CRC' | 'USD'
}

export function getDebtTimeline(params: GetDebtTimelineParams): TimelineEvent[] {
  const events: TimelineEvent[] = []

  for (const inst of params.installments) {
    events.push({
      kind: 'installment_due',
      // Use noon UTC to keep the date stable across timezones for display
      date: new Date(inst.due_date + 'T12:00:00Z'),
      amount_minor: BigInt(inst.amount_minor),
      currency: params.currency,
      status: inst.status,
      ref_id: inst.id,
      meta: {
        sequence_number: inst.sequence_number,
        remaining_amount_minor: BigInt(inst.remaining_amount_minor),
      },
    })
  }

  for (const pmt of params.payments) {
    events.push({
      kind: 'payment_received',
      date: new Date(pmt.created_at),
      amount_minor: BigInt(pmt.amount_minor),
      currency: pmt.currency as 'CRC' | 'USD',
      status: pmt.status,
      ref_id: pmt.id,
      meta: { notes: pmt.notes, applied_at: pmt.applied_at },
    })
  }

  for (const app of params.applications) {
    events.push({
      kind: 'payment_application',
      date: new Date(app.created_at),
      amount_minor: BigInt(app.applied_amount_minor),
      currency: params.currency,
      status: 'applied',
      ref_id: app.id,
      meta: { payment_id: app.payment_id, target_id: app.target_id },
    })
  }

  return events.sort((a, b) => a.date.getTime() - b.date.getTime())
}
