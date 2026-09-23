import { DebtStatus, DebtTiming, toCents } from '@/commons/constants/debt.constant'

import { comparePeriods, PaymentPeriod, paymentPeriodOf } from './payment-period.helper'

export interface DebtBalance extends PaymentPeriod {
  id: string
  amount: number
  paidAmount: number
  dueDate?: Date | null
}

export interface PaymentAllocation {
  debtId: string
  amount: number
}

export const balanceOf = ({ amount, paidAmount }: Pick<DebtBalance, 'amount' | 'paidAmount'>) =>
  toCents(Math.max(amount - paidAmount, 0))

// Status after the confirmed payments (D60): Amortizado in Notion = fully paid before its payment month
export function debtStatusFor(debt: DebtBalance, lastPaidAt: Date | null): DebtStatus {
  const paid = toCents(debt.paidAmount)
  if (paid <= 0) return DebtStatus.PENDING
  if (paid < toCents(debt.amount)) return DebtStatus.PARTIAL
  if (lastPaidAt && comparePeriods(paymentPeriodOf(lastPaidAt.toISOString()), debt) < 0) return DebtStatus.PREPAID
  return DebtStatus.PAID
}

// Not stored: "No iniciado" and "Retrasado" of Notion depend on today (YYYY-MM-DD in America/Lima)
export function debtTiming(debt: Pick<DebtBalance, 'paymentMonth' | 'paymentYear' | 'dueDate'>, today: string) {
  if (debt.dueDate && debt.dueDate.toISOString().slice(0, 10) < today) return DebtTiming.LATE
  const diff = comparePeriods(debt, paymentPeriodOf(today))
  if (diff < 0) return DebtTiming.LATE
  return diff === 0 ? DebtTiming.DUE : DebtTiming.UPCOMING
}

// A payment covers the oldest open installments first (block 2 of P17). What exceeds every balance is returned apart.
export function allocatePayment(
  openDebts: DebtBalance[],
  amount: number,
): { allocations: PaymentAllocation[]; excess: number } {
  const ordered = [...openDebts].sort((a, b) => comparePeriods(a, b))
  const allocations: PaymentAllocation[] = []
  let left = toCents(amount)

  for (const debt of ordered) {
    if (left <= 0) break
    const part = Math.min(balanceOf(debt), left)
    if (part <= 0) continue
    allocations.push({ debtId: debt.id, amount: toCents(part) })
    left = toCents(left - part)
  }

  return { allocations, excess: left }
}
