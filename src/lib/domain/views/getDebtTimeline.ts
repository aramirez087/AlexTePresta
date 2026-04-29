export type TimelineEventKind =
  | 'installment_due'
  | 'payment_received'
  | 'payment_application'
  | 'installment_converted'
  | 'interest_debt_created'
  | 'interest_accrued'

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

type InterestDebtRow = {
  id: string
  source_installment_id: string | null
  principal_minor: number
  current_balance_minor: number
  interest_rate: string
  created_at: string
  is_simulated?: boolean
}

type AccrualRow = {
  id: string
  interest_debt_id: string
  period: string
  accrued_amount_minor: number
  closing_balance_minor: number
  created_at: string
}

export type GetDebtTimelineParams = {
  installments: InstallmentRow[]
  payments: PaymentRow[]
  applications: ApplicationRow[]
  currency: 'CRC' | 'USD'
  interest_debts?: InterestDebtRow[]
  accruals?: AccrualRow[]
}

export function getDebtTimeline(params: GetDebtTimelineParams): TimelineEvent[] {
  const events: TimelineEvent[] = []

  for (const inst of params.installments) {
    events.push({
      kind: inst.status === 'converted' ? 'installment_converted' : 'installment_due',
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

  for (const idb of params.interest_debts ?? []) {
    events.push({
      kind: 'interest_debt_created',
      date: new Date(idb.created_at),
      amount_minor: BigInt(idb.principal_minor),
      currency: params.currency,
      status: 'active',
      ref_id: idb.id,
      meta: {
        source_installment_id: idb.source_installment_id,
        interest_rate: idb.interest_rate,
        current_balance_minor: BigInt(idb.current_balance_minor),
        simulated: idb.is_simulated ?? false,
      },
    })
  }

  for (const acc of params.accruals ?? []) {
    events.push({
      kind: 'interest_accrued',
      date: new Date(acc.created_at),
      amount_minor: BigInt(acc.accrued_amount_minor),
      currency: params.currency,
      status: 'applied',
      ref_id: acc.id,
      meta: {
        period: acc.period,
        closing_balance_minor: BigInt(acc.closing_balance_minor),
        interest_debt_id: acc.interest_debt_id,
      },
    })
  }

  return events.sort((a, b) => a.date.getTime() - b.date.getTime())
}
