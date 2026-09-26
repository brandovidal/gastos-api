import { PaymentStatus } from '@/commons/constants/expense.constant'

import { addMonths, comparePeriods, PaymentPeriod } from './payment-period.helper'

// Loans and investments paid in installments (P27, D99)

export interface InstallmentPlan {
  installmentCount: number
  installmentAmount: number
  dueDay: number
  startMonth: number
  startYear: number
}

export interface PlannedInstallment extends PaymentPeriod {
  number: number
  installment: string // "17/48"
  dueDate: string // YYYY-MM-DD; a day the month does not have ("31") falls on its last day
  amount: number
}

const pad = (value: number) => String(value).padStart(2, '0')

function dueDateOf({ paymentMonth, paymentYear }: PaymentPeriod, dueDay: number): string {
  const last = new Date(Date.UTC(paymentYear, paymentMonth, 0)).getUTCDate()
  return `${paymentYear}-${pad(paymentMonth)}-${pad(Math.min(dueDay, last))}`
}

// Installment k is paid in the k-th month from the start, on its due day
export function plannedInstallments(plan: InstallmentPlan): PlannedInstallment[] {
  const start: PaymentPeriod = { paymentMonth: plan.startMonth, paymentYear: plan.startYear }
  return Array.from({ length: plan.installmentCount }, (_, index) => {
    const period = addMonths(start, index)
    return {
      ...period,
      number: index + 1,
      installment: `${index + 1}/${plan.installmentCount}`,
      dueDate: dueDateOf(period, plan.dueDay),
      amount: plan.installmentAmount,
    }
  })
}

// "17/48" → 17; null when the text is not an installment
export function installmentNumber(installment: string | null | undefined): number | null {
  const match = installment?.match(/^(\d{1,3})\/\d{1,3}$/)
  return match ? Number(match[1]) : null
}

export interface InstallmentRow extends PaymentPeriod {
  installment: string | null
  amount: number
  paymentStatus: string
  dueDate: Date | null
}

const round2 = (value: number) => Math.round(value * 100) / 100
const isPaid = (row: Pick<InstallmentRow, 'paymentStatus'>) => row.paymentStatus === PaymentStatus.PAID

export interface CommitmentProgress {
  installmentCount: number
  createdCount: number // installments that exist as rows
  paidCount: number
  remainingCount: number
  currentInstallment: number // the installment of this month, or the last one before it; 0 before the first
  paidAmount: number
  pendingAmount: number // what the installments not paid yet add up to
  lateCount: number // not paid and past their month (or due date)
  nextDueDate: string | null // of the first installment not paid
}

// Where a loan stands today: how many installments are paid, which one is current, how much is paid and what is left.
// Cancellation stays apart: it is the amount quoted by the bank, edited by hand
export function progressOf(installmentCount: number, rows: InstallmentRow[], today: string): CommitmentProgress {
  const now: PaymentPeriod = { paymentMonth: Number(today.slice(5, 7)), paymentYear: Number(today.slice(0, 4)) }
  const ordered = [...rows].sort((a, b) => comparePeriods(a, b))
  const unpaid = ordered.filter((row) => !isPaid(row))
  const upToNow = ordered.filter((row) => comparePeriods(row, now) <= 0)
  const paidCount = ordered.length - unpaid.length

  return {
    installmentCount,
    createdCount: ordered.length,
    paidCount,
    remainingCount: Math.max(installmentCount - paidCount, 0),
    currentInstallment: upToNow.length
      ? (installmentNumber(upToNow[upToNow.length - 1].installment) ?? upToNow.length)
      : 0,
    paidAmount: round2(ordered.filter(isPaid).reduce((sum, row) => sum + row.amount, 0)),
    pendingAmount: round2(unpaid.reduce((sum, row) => sum + row.amount, 0)),
    lateCount: unpaid.filter((row) => {
      if (row.dueDate) return row.dueDate.toISOString().slice(0, 10) < today
      return comparePeriods(row, now) < 0
    }).length,
    nextDueDate: unpaid[0]?.dueDate ? unpaid[0].dueDate.toISOString().slice(0, 10) : null,
  }
}
