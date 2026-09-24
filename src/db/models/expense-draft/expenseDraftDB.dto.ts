import { ExpenseDraft } from '@/generated/prisma/client'

// A shared expense (P17): the user and the people of personIds split it in `parts` equal parts (parts ≥ people + 1)
export interface SharedExpense {
  personIds: string[]
  parts: number
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
