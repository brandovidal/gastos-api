export enum Currency {
  PEN = 'PEN',
  USD = 'USD',
}

export enum ExpenseDestination {
  DAILY = 'daily', // day-to-day expenses ("gastos sin culpa"), saved in exp_daily_expenses
  FIXED_COST = 'fixed_cost',
  SUBSCRIPTION = 'subscription',
  CREDIT_CARD = 'credit_card',
  RECEIVABLE = 'receivable',
  DISCARD = 'discard',
}

export enum ExpenseType {
  ESSENTIAL = 'essential',
  GUILTY_PLEASURE = 'guilty_pleasure',
}

export enum PaymentStatus {
  NOT_STARTED = 'not_started',
  PENDING = 'pending',
  PARTIALLY_PAID = 'partially_paid',
  DEPOSITED = 'deposited',
  WAIVED = 'waived',
  PAID = 'paid',
  AMORTIZED = 'amortized',
  CASHBACK = 'cashback',
  SKIPPED = 'skipped',
}

// Allowed payment statuses per expense table
export const FIXED_COST_STATUSES = [
  PaymentStatus.NOT_STARTED,
  PaymentStatus.PENDING,
  PaymentStatus.PARTIALLY_PAID,
  PaymentStatus.DEPOSITED,
  PaymentStatus.WAIVED,
  PaymentStatus.PAID,
] as const

export const SUBSCRIPTION_STATUSES = [
  PaymentStatus.NOT_STARTED,
  PaymentStatus.PENDING,
  PaymentStatus.PAID,
  PaymentStatus.WAIVED,
] as const

export const CREDIT_CARD_EXPENSE_STATUSES = [
  PaymentStatus.NOT_STARTED,
  PaymentStatus.PENDING,
  PaymentStatus.PARTIALLY_PAID,
  PaymentStatus.DEPOSITED,
  PaymentStatus.AMORTIZED,
  PaymentStatus.CASHBACK,
  PaymentStatus.PAID,
  PaymentStatus.SKIPPED,
] as const

export enum ReceivableStatus {
  PENDING = 'pending',
  PARTIAL = 'partial',
  PAID = 'paid',
}

export enum SubscriptionPeriod {
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  SEMIANNUAL = 'semiannual',
  ANNUAL = 'annual',
}

export enum RecurringTargetType {
  FIXED_COST = 'fixed_cost',
  SUBSCRIPTION = 'subscription',
  CREDIT_CARD = 'credit_card',
}

// Installment format: "current/total", e.g. "2/6"
export const INSTALLMENT_REGEX = /^\d{1,3}\/\d{1,3}$/
