import { SubscriptionPeriod } from '@/commons/constants/expense.constant'

// Months between two rows of a template (D107): an annual one (a domain) only comes back after 12
const MONTHS_BETWEEN: Record<string, number> = {
  [SubscriptionPeriod.BIWEEKLY]: 1, // one row per month holds both payments
  [SubscriptionPeriod.MONTHLY]: 1,
  [SubscriptionPeriod.QUARTERLY]: 3,
  [SubscriptionPeriod.SEMIANNUAL]: 6,
  [SubscriptionPeriod.ANNUAL]: 12,
}

// Whether a template is due in the month that starts on monthStart, given the first day of the last month it generated
export function isDue(period: string, lastGeneratedAt: Date | null, monthStart: Date): boolean {
  if (!lastGeneratedAt) return true
  const months =
    (monthStart.getUTCFullYear() - lastGeneratedAt.getUTCFullYear()) * 12 +
    (monthStart.getUTCMonth() - lastGeneratedAt.getUTCMonth())
  return months >= (MONTHS_BETWEEN[period] ?? 1)
}
