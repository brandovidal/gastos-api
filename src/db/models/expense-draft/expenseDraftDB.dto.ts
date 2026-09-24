import { ExpenseDraft } from '@/generated/prisma/client'

// One person's part of what the user paid (D73, D74): a ratio of the total (0.5, 1/3, 0.2) or a fixed amount
export interface ExpenseShare {
  personId: string
  ratio?: number
  amount?: number
}

// A shared expense: the user paid it all and each of these people owes their part
export interface SharedExpense {
  shares: ExpenseShare[]
}

// /editar (D76): every filter is optional; text looks in the concept
export interface SavedExpenseFilters {
  text?: string
  amount?: number
  day?: Date
  personId?: string
  paymentMethodId?: string
  categoryId?: string
  since: Date
}

export type ExpenseDraftDbDto = Omit<ExpenseDraft, 'confidence' | 'missingFields' | 'sharedWith'> & {
  confidence: Record<string, number>
  missingFields: string[]
  sharedWith: SharedExpense | null
}

export type CreateExpenseDraftDbDto = Pick<ExpenseDraft, 'channel' | 'chatId' | 'messageId' | 'inputType'> &
  Partial<
    Pick<
      ExpenseDraft,
      'itemIndex' | 'batchId' | 'documentType' | 'rawText' | 'mediaFileId' | 'mediaUniqueId' | 'fileId'
    >
  >

export type UpdateExpenseDraftDbDto = Partial<
  Omit<ExpenseDraftDbDto, 'id' | 'channel' | 'chatId' | 'messageId' | 'itemIndex' | 'createdAt' | 'updatedAt'>
>
