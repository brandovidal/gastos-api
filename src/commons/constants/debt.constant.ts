import { ExpenseDestination } from './expense.constant'

// Loans and debts with people (P17, D38, D60)
export enum DebtDirection {
  OWED_TO_ME = 'owed_to_me', // someone owes the user (Cuentas in Notion)
  I_OWE = 'i_owe',
}

// Stored status, always derived from the confirmed payments (Notion: Pendiente · Abonado · Amortizado · Pagado)
export enum DebtStatus {
  PENDING = 'pending', // nothing paid
  PARTIAL = 'partial', // part of the installment paid
  PREPAID = 'prepaid', // fully paid before its payment month
  PAID = 'paid',
}

export const OPEN_DEBT_STATUSES = [DebtStatus.PENDING, DebtStatus.PARTIAL]

// Computed from today, never stored (Notion: No iniciado · Retrasado)
export enum DebtTiming {
  UPCOMING = 'upcoming', // payment month still ahead
  DUE = 'due', // this month
  LATE = 'late', // payment month or due date already passed
}

export const DEBT_DIRECTION_BY_DESTINATION: Partial<Record<ExpenseDestination, DebtDirection>> = {
  [ExpenseDestination.RECEIVABLE]: DebtDirection.OWED_TO_ME,
  [ExpenseDestination.PAYABLE]: DebtDirection.I_OWE,
}

// A payment proposal from the bot not confirmed within this time is ignored (and replaced by the next one)
export const DEBT_PAYMENT_PROPOSAL_MINUTES = 30

// Rounding of money: installments and balances in cents
export const toCents = (amount: number) => Math.round(amount * 100) / 100
