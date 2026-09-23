import { ExpenseDraft } from '@/generated/prisma/client'

export type ExpenseDraftDbDto = Omit<ExpenseDraft, 'confidence' | 'missingFields'> & {
  confidence: Record<string, number>
  missingFields: string[]
}

export type CreateExpenseDraftDbDto = Pick<ExpenseDraft, 'channel' | 'chatId' | 'messageId' | 'inputType'> &
  Partial<Pick<ExpenseDraft, 'itemIndex' | 'documentType' | 'rawText' | 'mediaFileId' | 'mediaUniqueId' | 'fileId'>>

export type UpdateExpenseDraftDbDto = Partial<
  Omit<ExpenseDraftDbDto, 'id' | 'channel' | 'chatId' | 'messageId' | 'itemIndex' | 'createdAt' | 'updatedAt'>
>
