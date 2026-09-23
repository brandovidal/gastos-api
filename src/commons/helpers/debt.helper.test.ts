import { DebtStatus, DebtTiming } from '@/commons/constants/debt.constant'

import { allocatePayment, balanceOf, debtStatusFor, debtTiming, DebtBalance } from './debt.helper'

const debt = (overrides: Partial<DebtBalance> = {}): DebtBalance => ({
  id: 'debt-1',
  amount: 400,
  paidAmount: 0,
  paymentMonth: 9,
  paymentYear: 2026,
  dueDate: null,
  ...overrides,
})

describe('debt helpers', () => {
  describe('debtStatusFor', () => {
    it.each([
      ['nothing paid', debt(), null, DebtStatus.PENDING],
      ['part of it (Abonado)', debt({ paidAmount: 150 }), new Date('2026-09-10T15:00:00Z'), DebtStatus.PARTIAL],
      ['all of it in its month', debt({ paidAmount: 400 }), new Date('2026-09-30T15:00:00Z'), DebtStatus.PAID],
      ['all of it later', debt({ paidAmount: 400 }), new Date('2026-11-02T15:00:00Z'), DebtStatus.PAID],
      [
        'all of it before its month (Amortizado)',
        debt({ paidAmount: 400 }),
        new Date('2026-08-20T15:00:00Z'),
        DebtStatus.PREPAID,
      ],
      [
        'cents of rounding',
        debt({ amount: 133.33, paidAmount: 133.330000001 }),
        new Date('2026-09-01T15:00:00Z'),
        DebtStatus.PAID,
      ],
    ])('should be %s', (_case, row, lastPaidAt, expected) => {
      expect(debtStatusFor(row, lastPaidAt)).toBe(expected)
    })
  })

  describe('debtTiming', () => {
    it.each([
      ['a past month (Retrasado)', debt({ paymentMonth: 8 }), DebtTiming.LATE],
      ['this month', debt(), DebtTiming.DUE],
      ['a future month (No iniciado)', debt({ paymentMonth: 10 }), DebtTiming.UPCOMING],
      ['a due date already passed', debt({ dueDate: new Date('2026-09-15T00:00:00Z') }), DebtTiming.LATE],
      ['a due date still ahead', debt({ dueDate: new Date('2026-09-30T00:00:00Z') }), DebtTiming.DUE],
    ])('should mark %s', (_case, row, expected) => {
      expect(debtTiming(row, '2026-09-23')).toBe(expected)
    })
  })

  it('should never give a negative balance', () => {
    expect(balanceOf({ amount: 100, paidAmount: 40 })).toBe(60)
    expect(balanceOf({ amount: 100, paidAmount: 120 })).toBe(0)
  })

  describe('allocatePayment', () => {
    const open = [
      debt({ id: 'october', paymentMonth: 10 }),
      debt({ id: 'august', paymentMonth: 8, paidAmount: 150 }),
      debt({ id: 'september', paymentMonth: 9 }),
    ]

    it('should cover the oldest installments first', () => {
      expect(allocatePayment(open, 500)).toEqual({
        allocations: [
          { debtId: 'august', amount: 250 },
          { debtId: 'september', amount: 250 },
        ],
        excess: 0,
      })
    })

    it('should return what exceeds every balance apart', () => {
      expect(allocatePayment(open, 1100)).toEqual({
        allocations: [
          { debtId: 'august', amount: 250 },
          { debtId: 'september', amount: 400 },
          { debtId: 'october', amount: 400 },
        ],
        excess: 50,
      })
    })

    it('should keep cents exact', () => {
      const { allocations, excess } = allocatePayment(
        [debt({ amount: 33.33 }), debt({ id: 'b', amount: 33.33, paymentMonth: 10 })],
        50.1,
      )
      expect(allocations).toEqual([
        { debtId: 'debt-1', amount: 33.33 },
        { debtId: 'b', amount: 16.77 },
      ])
      expect(excess).toBe(0)
    })
  })
})
