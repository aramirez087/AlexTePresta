import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DebtTimeline } from '../DebtTimeline'
import type { TimelineEvent } from '@/lib/domain/views/getDebtTimeline'

function makeInstallmentEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    kind: 'installment_due',
    date: new Date('2025-06-01T12:00:00Z'),
    amount_minor: 100000n,
    currency: 'CRC',
    status: 'pending',
    ref_id: `inst-${Math.random()}`,
    ...overrides,
  }
}

function makePaymentEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    kind: 'payment_received',
    date: new Date('2025-05-15T10:00:00Z'),
    amount_minor: 100000n,
    currency: 'CRC',
    status: 'approved',
    ref_id: `pmt-${Math.random()}`,
    ...overrides,
  }
}

function makeApplicationEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    kind: 'payment_application',
    date: new Date('2025-05-15T10:01:00Z'),
    amount_minor: 100000n,
    currency: 'CRC',
    status: 'applied',
    ref_id: `app-${Math.random()}`,
    ...overrides,
  }
}

describe('DebtTimeline — snapshots', () => {
  it('renders all-paid scenario', () => {
    const events: TimelineEvent[] = [
      makeInstallmentEvent({ status: 'paid', date: new Date('2025-03-01T12:00:00Z') }),
      makeInstallmentEvent({ status: 'paid', date: new Date('2025-04-01T12:00:00Z') }),
      makeInstallmentEvent({ status: 'paid', date: new Date('2025-05-01T12:00:00Z') }),
    ]
    const { container } = render(<DebtTimeline events={events} />)
    expect(container).toMatchSnapshot()
  })

  it('renders partially-paid scenario (pending installment with reduced remaining)', () => {
    const events: TimelineEvent[] = [
      makeInstallmentEvent({
        status: 'paid',
        date: new Date('2025-03-01T12:00:00Z'),
      }),
      makePaymentEvent({ date: new Date('2025-03-10T10:00:00Z') }),
      makeApplicationEvent({ date: new Date('2025-03-10T10:01:00Z') }),
      makeInstallmentEvent({
        status: 'pending',
        date: new Date('2025-04-01T12:00:00Z'),
        amount_minor: 100000n,
        meta: { remaining_amount_minor: 50000n, sequence_number: 2 },
      }),
    ]
    const { container } = render(<DebtTimeline events={events} />)
    expect(container).toMatchSnapshot()
  })

  it('renders overdue scenario', () => {
    const events: TimelineEvent[] = [
      makeInstallmentEvent({
        status: 'overdue',
        date: new Date('2024-01-01T12:00:00Z'),
      }),
    ]
    const { container } = render(<DebtTimeline events={events} />)
    expect(container).toMatchSnapshot()
  })

  it('renders future-installments scenario', () => {
    const events: TimelineEvent[] = [
      makeInstallmentEvent({ status: 'pending', date: new Date('2025-06-01T12:00:00Z') }),
      makeInstallmentEvent({ status: 'pending', date: new Date('2025-07-01T12:00:00Z') }),
      makeInstallmentEvent({ status: 'pending', date: new Date('2025-08-01T12:00:00Z') }),
      makeInstallmentEvent({ status: 'pending', date: new Date('2025-09-01T12:00:00Z') }),
      makeInstallmentEvent({ status: 'pending', date: new Date('2025-10-01T12:00:00Z') }),
    ]
    const { container } = render(<DebtTimeline events={events} />)
    expect(container).toMatchSnapshot()
  })
})

describe('DebtTimeline — component tests', () => {
  it('renders an <ol> element as semantic list', () => {
    const events = [makeInstallmentEvent()]
    render(<DebtTimeline events={events} />)
    expect(screen.getByRole('list')).toBeInTheDocument()
  })

  it('renders emptyMessage when events array is empty', () => {
    render(<DebtTimeline events={[]} emptyMessage="No hay movimientos." />)
    expect(screen.getByText('No hay movimientos.')).toBeInTheDocument()
  })

  it('shows Spanish label "Pago recibido" for payment_received event', () => {
    const events = [makePaymentEvent()]
    render(<DebtTimeline events={events} />)
    expect(screen.getByText('Pago recibido')).toBeInTheDocument()
  })

  it('shows Spanish label "Cuota" for installment_due event', () => {
    const events = [makeInstallmentEvent()]
    render(<DebtTimeline events={events} />)
    expect(screen.getByText('Cuota')).toBeInTheDocument()
  })

  it('does not show red overdue styling for a paid installment', () => {
    const events = [makeInstallmentEvent({ status: 'paid' })]
    render(<DebtTimeline events={events} />)
    const badge = screen.getByText('Pagado')
    expect(badge.className).not.toContain('red')
    expect(badge.className).toContain('green')
  })

  it('shows Spanish label "Cuota convertida" for installment_converted event', () => {
    const events: TimelineEvent[] = [
      {
        kind: 'installment_converted',
        date: new Date('2025-06-01T12:00:00Z'),
        amount_minor: 147875n,
        currency: 'CRC',
        status: 'converted',
        ref_id: 'inst-converted-1',
      },
    ]
    render(<DebtTimeline events={events} />)
    expect(screen.getByText('Cuota convertida')).toBeInTheDocument()
  })

  it('shows Spanish label "Deuda de interés creada" for interest_debt_created event', () => {
    const events: TimelineEvent[] = [
      {
        kind: 'interest_debt_created',
        date: new Date('2025-06-05T10:00:00Z'),
        amount_minor: 47875n,
        currency: 'CRC',
        status: 'active',
        ref_id: 'idebt-1',
      },
    ]
    render(<DebtTimeline events={events} />)
    expect(screen.getByText('Deuda de interés creada')).toBeInTheDocument()
  })

  it('shows Spanish label "Interés acumulado" for interest_accrued event', () => {
    const events: TimelineEvent[] = [
      {
        kind: 'interest_accrued',
        date: new Date('2025-07-25T10:00:00Z'),
        amount_minor: 958n,
        currency: 'CRC',
        status: 'applied',
        ref_id: 'acc-1',
      },
    ]
    render(<DebtTimeline events={events} />)
    expect(screen.getByText('Interés acumulado')).toBeInTheDocument()
  })
})

describe('DebtTimeline — interest event snapshot', () => {
  it('renders interest conversion and accrual scenario', () => {
    const events: TimelineEvent[] = [
      {
        kind: 'installment_converted',
        date: new Date('2025-06-01T12:00:00Z'),
        amount_minor: 147875n,
        currency: 'CRC',
        status: 'converted',
        ref_id: 'inst-converted-1',
      },
      {
        kind: 'interest_debt_created',
        date: new Date('2025-06-01T12:00:01Z'),
        amount_minor: 47875n,
        currency: 'CRC',
        status: 'active',
        ref_id: 'idebt-1',
      },
      {
        kind: 'interest_accrued',
        date: new Date('2025-07-25T10:00:00Z'),
        amount_minor: 958n,
        currency: 'CRC',
        status: 'applied',
        ref_id: 'acc-1',
        meta: { period: '2025-07', closing_balance_minor: 48833n },
      },
    ]
    const { container } = render(<DebtTimeline events={events} />)
    expect(container).toMatchSnapshot()
  })
})

describe('DebtTimeline — simulated event styling', () => {
  it('renders amber dashed border for simulated interest_debt event', () => {
    const events: TimelineEvent[] = [
      {
        kind: 'interest_debt_created',
        date: new Date('2025-06-05T10:00:00Z'),
        amount_minor: 47875n,
        currency: 'CRC',
        status: 'active',
        ref_id: 'idebt-sim-1',
        meta: { simulated: true },
      },
    ]
    const { container } = render(<DebtTimeline events={events} />)
    const li = container.querySelector('li')
    expect(li?.className).toContain('border-dashed')
    expect(li?.className).toContain('border-amber-400')
  })

  it('renders "Simulado" label for simulated events', () => {
    const events: TimelineEvent[] = [
      {
        kind: 'interest_debt_created',
        date: new Date('2025-06-05T10:00:00Z'),
        amount_minor: 47875n,
        currency: 'CRC',
        status: 'active',
        ref_id: 'idebt-sim-2',
        meta: { simulated: true },
      },
    ]
    render(<DebtTimeline events={events} />)
    expect(screen.getByText('Simulado')).toBeInTheDocument()
  })

  it('does NOT render dashed border for non-simulated events', () => {
    const events: TimelineEvent[] = [
      {
        kind: 'interest_debt_created',
        date: new Date('2025-06-05T10:00:00Z'),
        amount_minor: 47875n,
        currency: 'CRC',
        status: 'active',
        ref_id: 'idebt-real-1',
      },
    ]
    const { container } = render(<DebtTimeline events={events} />)
    const li = container.querySelector('li')
    expect(li?.className).not.toContain('border-dashed')
  })

  it('renders snapshot with mixed real and simulated events', () => {
    const events: TimelineEvent[] = [
      {
        kind: 'interest_debt_created',
        date: new Date('2025-06-05T10:00:00Z'),
        amount_minor: 47875n,
        currency: 'CRC',
        status: 'active',
        ref_id: 'idebt-real-snap',
      },
      {
        kind: 'interest_debt_created',
        date: new Date('2025-06-05T10:00:01Z'),
        amount_minor: 47875n,
        currency: 'CRC',
        status: 'active',
        ref_id: 'idebt-sim-snap',
        meta: { simulated: true },
      },
    ]
    const { container } = render(<DebtTimeline events={events} />)
    expect(container).toMatchSnapshot()
  })
})
