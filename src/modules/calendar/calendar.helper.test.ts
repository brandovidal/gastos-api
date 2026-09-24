import { dayOf, parseInstallment, periodsBetween, statementDates } from './calendar.helper'

describe('calendar.helper', () => {
  it('should move a day that the month does not have to its last day', () => {
    expect(dayOf(2026, 9, 31)).toBe('2026-09-30')
    expect(dayOf(2027, 2, 30)).toBe('2027-02-28')
    expect(dayOf(2026, 10, 5)).toBe('2026-10-05')
  })

  it('should list every payment month between two days, across the year', () => {
    expect(periodsBetween('2026-11-20', '2027-01-05')).toEqual([
      { paymentMonth: 11, paymentYear: 2026 },
      { paymentMonth: 12, paymentYear: 2026 },
      { paymentMonth: 1, paymentYear: 2027 },
    ])
    expect(periodsBetween('2026-09-01', '2026-09-30')).toEqual([{ paymentMonth: 9, paymentYear: 2026 }])
  })

  it('should pay a statement the next month when the due day comes before the closing day (IO, CMR)', () => {
    expect(statementDates(25, 12, { paymentMonth: 9, paymentYear: 2026 })).toEqual({
      closeDate: '2026-09-25',
      dueDate: '2026-10-12',
    })
    expect(statementDates(10, 5, { paymentMonth: 12, paymentYear: 2026 })).toEqual({
      closeDate: '2026-12-10',
      dueDate: '2027-01-05',
    })
  })

  it('should pay a statement the same month when the due day comes after the closing day', () => {
    expect(statementDates(5, 28, { paymentMonth: 2, paymentYear: 2027 })).toEqual({
      closeDate: '2027-02-05',
      dueDate: '2027-02-28',
    })
  })

  it('should read "n/m" installments only', () => {
    expect(parseInstallment('3/10')).toEqual({ current: 3, total: 10 })
    expect(parseInstallment(null)).toBeNull()
    expect(parseInstallment('tres')).toBeNull()
  })
})
