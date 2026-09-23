export interface PaymentPeriod {
  paymentMonth: number
  paymentYear: number
}

const fromIsoDate = (isoDate: string) => ({
  year: Number(isoDate.slice(0, 4)),
  month: Number(isoDate.slice(5, 7)),
  day: Number(isoDate.slice(8, 10)),
})

// Fixed costs, subscriptions and receivables are paid in the month of the expense
export function paymentPeriodOf(isoDate: string): PaymentPeriod {
  const { year, month } = fromIsoDate(isoDate)
  return { paymentMonth: month, paymentYear: year }
}

// Credit cards: a purchase up to the closing day belongs to that month's statement, later ones to the next.
// Same rule as the Notion boards (IO closes on 25: 18/09 -> September; CMR closes on 10: 15/09 -> October).
export function creditCardPaymentPeriod(isoDate: string, billingCloseDay: number): PaymentPeriod {
  const { year, month, day } = fromIsoDate(isoDate)

  if (day <= billingCloseDay) {
    return { paymentMonth: month, paymentYear: year }
  }

  return month === 12 ? { paymentMonth: 1, paymentYear: year + 1 } : { paymentMonth: month + 1, paymentYear: year }
}
