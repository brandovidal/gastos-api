import { ExpenseFile } from '@/generated/prisma/client'

export type ExpenseFileDbDto = Omit<ExpenseFile, 'confidence' | 'missingFields'> & {
  confidence: Record<string, number>
  missingFields: string[]
}

export type CreateExpenseFileDbDto = Pick<ExpenseFile, 'channel' | 'chatId' | 'messageId' | 'inputType'> &
  Partial<Pick<ExpenseFile, 'itemIndex' | 'documentType' | 'rawText' | 'mediaFileId'>>

export type UpdateExpenseFileDbDto = Partial<
  Omit<ExpenseFileDbDto, 'id' | 'channel' | 'chatId' | 'messageId' | 'itemIndex' | 'createdAt' | 'updatedAt'>
>
