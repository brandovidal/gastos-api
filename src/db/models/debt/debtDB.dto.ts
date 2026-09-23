import { Debt, DebtPayment, Person, Prisma } from '@/generated/prisma/client'

export type CreateDebtDbDto = Omit<Prisma.DebtUncheckedCreateInput, 'id' | 'status' | 'paidAmount' | 'paidDate'>

export type UpdateDebtDbDto = Partial<
  Pick<
    Debt,
    | 'description'
    | 'amount'
    | 'currency'
    | 'exchangeRate'
    | 'amountInPen'
    | 'installment'
    | 'paymentMonth'
    | 'paymentYear'
    | 'dueDate'
    | 'personId'
    | 'notes'
  >
>

export interface DebtFilterDbDto {
  personId?: string
  direction?: string
  statuses?: string[]
}

export interface CreateDebtPaymentDbDto {
  debtId: string
  amount: number
  paidAt: Date
  paymentMethodId?: string | null
  notes?: string | null
}

export type DebtWithPersonDbDto = Debt & { person: Pick<Person, 'id' | 'name'> }

export type DebtPaymentProposalDbDto = DebtPayment & { debt: DebtWithPersonDbDto }
