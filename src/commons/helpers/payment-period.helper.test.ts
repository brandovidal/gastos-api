import { creditCardPaymentPeriod, paymentPeriodOf } from './payment-period.helper'

describe('payment period helpers', () => {
  it('should use the month of the expense for non card expenses', () => {
    expect(paymentPeriodOf('2026-09-22')).toEqual({ paymentMonth: 9, paymentYear: 2026 })
  })

  it.each([
    [
      'IO closes on 25: a purchase on 18/09 is paid in September',
      '2026-09-18',
      25,
      { paymentMonth: 9, paymentYear: 2026 },
    ],
    ['the closing day itself stays in the month', '2026-09-25', 25, { paymentMonth: 9, paymentYear: 2026 }],
    [
      'CMR closes on 10: a purchase on 15/09 is paid in October',
      '2026-09-15',
      10,
      { paymentMonth: 10, paymentYear: 2026 },
    ],
    [
      'December after the close moves to January of the next year',
      '2026-12-20',
      10,
      { paymentMonth: 1, paymentYear: 2027 },
    ],
  ])('%s', (_case, date, closeDay, expected) => {
    expect(creditCardPaymentPeriod(date, closeDay)).toEqual(expected)
  })
})
