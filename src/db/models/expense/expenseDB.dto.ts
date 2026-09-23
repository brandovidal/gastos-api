import { Prisma } from '@/generated/prisma/client'
import { ExpenseDestination } from '@/commons/constants/expense.constant'

// Record to create in the table of each destination, without the expenseFileId (set by the repository)
export type SaveExpenseDbDto =
  | { destination: ExpenseDestination.FIXED_COST; data: Omit<Prisma.FixedCostUncheckedCreateInput, 'expenseFileId'> }
  | {
      destination: ExpenseDestination.SUBSCRIPTION
      data: Omit<Prisma.SubscriptionUncheckedCreateInput, 'expenseFileId'>
    }
  | {
      destination: ExpenseDestination.CREDIT_CARD
      data: Omit<Prisma.CreditCardExpenseUncheckedCreateInput, 'expenseFileId'>
    }
  | {
      destination: ExpenseDestination.RECEIVABLE
      data: Omit<Prisma.AccountReceivableUncheckedCreateInput, 'expenseFileId'>
    }

export interface MonthlyTotalDbDto {
  destination: ExpenseDestination
  currency: string
  personId: string
  total: number
  count: number
}
