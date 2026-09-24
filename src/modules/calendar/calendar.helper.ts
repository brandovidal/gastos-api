import { addMonths, PaymentPeriod } from '@/commons/helpers/payment-period.helper'

const pad = (value: number) => String(value).padStart(2, '0')

// YYYY-MM-DD of that day, or of the last day of the month when it is shorter ("day 31" in September → 30)
export function dayOf(year: number, month: number, day: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${pad(month)}-${pad(Math.min(day, last))}`
}

export const isoDate = (date: Date) => date.toISOString().slice(0, 10)

export const periodOf = (isoDay: string): PaymentPeriod => ({
  paymentMonth: Number(isoDay.slice(5, 7)),
  paymentYear: Number(isoDay.slice(0, 4)),
})

// Every payment month touched by the days from..to (both included)
export function periodsBetween(from: string, to: string): PaymentPeriod[] {
  const periods: PaymentPeriod[] = []
  const last = periodOf(to)
  for (let period = periodOf(from); ; period = addMonths(period, 1)) {
    periods.push(period)
    if (period.paymentYear === last.paymentYear && period.paymentMonth === last.paymentMonth) return periods
  }
}

// The statement of a card for a payment month (D22, D66): it closes on the closing day of that month and is paid on
// the due day, in the same month when that day comes after the closing one, otherwise in the next month
// (IO closes 25 and is paid 12: the September statement is paid on October 12)
export function statementDates(
  billingCloseDay: number,
  paymentDueDay: number,
  { paymentMonth, paymentYear }: PaymentPeriod,
): { closeDate: string; dueDate: string } {
  const due =
    paymentDueDay > billingCloseDay ? { paymentMonth, paymentYear } : addMonths({ paymentMonth, paymentYear }, 1)
  return {
    closeDate: dayOf(paymentYear, paymentMonth, billingCloseDay),
    dueDate: dayOf(due.paymentYear, due.paymentMonth, paymentDueDay),
  }
}

// "3/10" → { current: 3, total: 10 }
export function parseInstallment(installment: string | null): { current: number; total: number } | null {
  const match = /^(\d{1,3})\/(\d{1,3})$/.exec(installment ?? '')
  if (!match) return null
  return { current: Number(match[1]), total: Number(match[2]) }
}

export const periodKey = ({ paymentMonth, paymentYear }: PaymentPeriod) => `${paymentYear}-${pad(paymentMonth)}`
