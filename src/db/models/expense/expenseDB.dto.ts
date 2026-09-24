import { Prisma } from '@/generated/prisma/client'
import { ExpenseDestination } from '@/commons/constants/expense.constant'

// Parts of a shared expense that others owe the user (P17): created with the expense, in the same transaction
type SharedDebts = { sharedDebts?: Omit<Prisma.DebtUncheckedCreateInput, 'draftId'>[] }

// Record to create in the table of each destination, without the draftId (set by the repository)
export type SaveExpenseDbDto = SharedDebts &
  (
    | { destination: ExpenseDestination.DAILY; data: Omit<Prisma.DailyExpenseUncheckedCreateInput, 'draftId'> }
    | { destination: ExpenseDestination.FIXED_COST; data: Omit<Prisma.FixedCostUncheckedCreateInput, 'draftId'> }
    | {
        destination: ExpenseDestination.SUBSCRIPTION
        data: Omit<Prisma.SubscriptionUncheckedCreateInput, 'draftId'>
      }
    | {
        // D66: "1/n" also creates the following installments, one per billing month
        destination: ExpenseDestination.CREDIT_CARD
        data: Omit<Prisma.CreditCardExpenseUncheckedCreateInput, 'draftId'>
        nextInstallments: Omit<Prisma.CreditCardExpenseUncheckedCreateInput, 'draftId'>[]
      }
    | {
        // P17: the first installment is linked to the draft; with "1/n" the following ones are created too (D60)
        destination: ExpenseDestination.RECEIVABLE | ExpenseDestination.PAYABLE
        data: Omit<Prisma.DebtUncheckedCreateInput, 'draftId'>
        nextInstallments: Omit<Prisma.DebtUncheckedCreateInput, 'draftId'>[]
      }
  )

export interface MonthlyTotalDbDto {
  destination: ExpenseDestination
  currency: string
  personId: string
  total: number
  count: number
}

export interface CategorySpentDbDto {
  categoryId: string | null
  total: number
}
