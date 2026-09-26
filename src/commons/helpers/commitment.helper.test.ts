import { installmentNumber, plannedInstallments, progressOf } from './commitment.helper'

const row = (installment: string, month: number, year: number, status = 'not_started', amount = 100, due?: string) => ({
  installment,
  paymentMonth: month,
  paymentYear: year,
  amount,
  paymentStatus: status,
  dueDate: due ? new Date(`${due}T00:00:00.000Z`) : null,
})

describe('commitment helper (P27, D99)', () => {
  it('should plan one installment per month from the start, on its due day', () => {
    const plan = plannedInstallments({
      installmentCount: 36,
      installmentAmount: 1950.76,
      dueDay: 5,
      startMonth: 10,
      startYear: 2025,
    })

    expect(plan).toHaveLength(36)
    expect(plan[0]).toEqual(
      expect.objectContaining({ installment: '1/36', paymentMonth: 10, paymentYear: 2025, dueDate: '2025-10-05' }),
    )
    // Notion: 03/36 is December 2025 and 16/36 January 2027
    expect(plan[2]).toEqual(expect.objectContaining({ installment: '3/36', paymentMonth: 12, paymentYear: 2025 }))
    expect(plan[15]).toEqual(expect.objectContaining({ installment: '16/36', paymentMonth: 1, paymentYear: 2027 }))
    expect(plan[35]).toEqual(expect.objectContaining({ installment: '36/36', paymentMonth: 9, paymentYear: 2028 }))
  })

  it('should put a day the month does not have on its last day', () => {
    const [jan, feb, , apr] = plannedInstallments({
      installmentCount: 4,
      installmentAmount: 10,
      dueDay: 31,
      startMonth: 1,
      startYear: 2028,
    })

    expect([jan.dueDate, feb.dueDate, apr.dueDate]).toEqual(['2028-01-31', '2028-02-29', '2028-04-30'])
  })

  it('should read the number of an installment', () => {
    expect(installmentNumber('17/48')).toBe(17)
    expect(installmentNumber('03/36')).toBe(3)
    expect(installmentNumber(null)).toBeNull()
    expect(installmentNumber('cuota')).toBeNull()
  })

  it('should say how many are paid, which is current, what is paid and what is pending', () => {
    const rows = [
      row('1/4', 6, 2026, 'paid', 100, '2026-06-05'),
      row('2/4', 7, 2026, 'paid', 100, '2026-07-05'),
      row('3/4', 8, 2026, 'pending', 100, '2026-08-05'),
      row('4/4', 9, 2026, 'not_started', 100, '2026-09-05'),
    ]

    expect(progressOf(4, rows, '2026-09-26')).toEqual({
      installmentCount: 4,
      createdCount: 4,
      paidCount: 2,
      remainingCount: 2,
      currentInstallment: 4,
      paidAmount: 200,
      pendingAmount: 200,
      lateCount: 2,
      nextDueDate: '2026-08-05',
    })
  })

  it('should be at 0 before the first installment and count only paid ones as paid (a partial is not)', () => {
    const rows = [row('1/2', 11, 2026, 'not_started'), row('2/2', 12, 2026, 'partially_paid')]

    expect(progressOf(2, rows, '2026-09-26')).toEqual(
      expect.objectContaining({ currentInstallment: 0, paidCount: 0, lateCount: 0, pendingAmount: 200 }),
    )
  })

  it('should tell a loan with installments not created yet: they are pending too', () => {
    const progress = progressOf(36, [row('1/36', 6, 2026, 'paid')], '2026-09-26')

    expect(progress).toEqual(expect.objectContaining({ createdCount: 1, paidCount: 1, remainingCount: 35 }))
  })
})
