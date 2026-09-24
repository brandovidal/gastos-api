import { BudgetStatus } from '@/commons/constants/budget.constant'
import { toCents } from '@/commons/constants/debt.constant'
import { SubscriptionPeriod } from '@/commons/constants/expense.constant'
import {
  DUPLICATE_WINDOW_HOURS,
  NOT_CHARGED_GRACE_DAYS,
  PRICE_CHANGE_MIN,
  UNPAID_STATUSES,
} from '@/commons/constants/notification.constant'
import { DateHelper } from '@/commons/helpers/date.helper'
import { CategoryBudgetLine } from '@/modules/budget/budget.service'
import { sameMerchant } from '@/modules/conversation/duplicate.helper'

// Cargos raros and budget alerts of the daily close (P20, D86): pure rules, no AI

export interface ChargeRow {
  id: string
  source: 'daily' | 'card'
  description: string
  amount: number
  currency: string
  paymentMethodId: string | null
  date: string // YYYY-MM-DD: spent or processed day
}

export interface SubscriptionRow {
  id: string
  description: string
  amount: number
  currency: string
  period: string
  paymentStatus: string
  dueDate: string | null
}

export interface PriceChange {
  charge: ChargeRow
  subscription: SubscriptionRow
  before: number
}

export interface DuplicateCharge {
  first: ChargeRow
  second: ChargeRow
}

const daysBetween = (a: string, b: string) =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / (24 * 60 * 60_000)

// "Netflix subió": a recent card charge of a platform (same name as a subscription) that costs more or less than the
// previous charge of that platform, or than the subscription when there is no previous charge
export function priceChanges(
  recentCardCharges: ChargeRow[],
  subscriptions: SubscriptionRow[],
  previousCardCharges: ChargeRow[],
): PriceChange[] {
  return recentCardCharges.flatMap((charge) => {
    const subscription = subscriptions.find((candidate) => sameMerchant(candidate.description, charge.description))
    if (!subscription || subscription.currency !== charge.currency) return []
    const previous = previousCardCharges
      .filter(
        (row) => row.id !== charge.id && row.date < charge.date && sameMerchant(row.description, charge.description),
      )
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    const before = previous?.amount ?? subscription.amount
    return Math.abs(charge.amount - before) >= PRICE_CHANGE_MIN ? [{ charge, subscription, before }] : []
  })
}

// Same amount, same payment method and the same merchant within 48 h: probably charged twice
export function duplicateCharges(rows: ChargeRow[]): DuplicateCharge[] {
  const found: DuplicateCharge[] = []
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  sorted.forEach((first, index) => {
    for (const second of sorted.slice(index + 1)) {
      if (
        toCents(first.amount) === toCents(second.amount) &&
        first.currency === second.currency &&
        first.paymentMethodId === second.paymentMethodId &&
        daysBetween(first.date, second.date) * 24 <= DUPLICATE_WINDOW_HOURS &&
        sameMerchant(first.description, second.description)
      ) {
        found.push({ first, second })
      }
    }
  })
  return found
}

// "Spotify no se cobró": a monthly subscription still unpaid 3 days after its due date and no card charge with its
// name in this or the previous statement
export function notCharged(
  subscriptions: SubscriptionRow[],
  cardCharges: ChargeRow[],
  today: string,
): SubscriptionRow[] {
  return subscriptions.filter(
    (subscription) =>
      subscription.period === SubscriptionPeriod.MONTHLY &&
      UNPAID_STATUSES.includes(subscription.paymentStatus) &&
      subscription.dueDate != null &&
      DateHelper.addDays(subscription.dueDate, NOT_CHARGED_GRACE_DAYS) < today &&
      !cardCharges.some((charge) => sameMerchant(charge.description, subscription.description)),
  )
}

// Categories at or over their alert threshold (80 % by default) or their limit
export const budgetAlerts = (lines: CategoryBudgetLine[]) =>
  lines.filter((line) => line.categoryId && (line.status === BudgetStatus.WARNING || line.status === BudgetStatus.OVER))
