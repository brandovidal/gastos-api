import { ExpenseDraft } from '@/generated/prisma/client'

import {
  ExpenseDraftChannel,
  ExpenseDraftInputType,
  ExpenseDraftStatus,
} from '@/commons/constants/expense-draft.constant'

import { CreateExpenseDraftDbDto } from '../expenseDraftDB.dto'

export const mockCreateExpenseDraft: CreateExpenseDraftDbDto = {
  channel: ExpenseDraftChannel.TELEGRAM,
  chatId: '123456',
  messageId: '42',
  inputType: ExpenseDraftInputType.TEXT,
  rawText: 'almuerzo 25 soles yape',
}

export const mockExpenseDraftRow: ExpenseDraft = {
  id: 'file-1',
  channel: ExpenseDraftChannel.TELEGRAM,
  chatId: '123456',
  messageId: '42',
  itemIndex: 0,
  inputType: ExpenseDraftInputType.TEXT,
  documentType: null,
  rawText: 'almuerzo 25 soles yape',
  mediaFileId: null,
  status: ExpenseDraftStatus.DRAFT,
  pendingField: null,
  destination: null,
  description: 'almuerzo',
  amount: 25,
  currency: 'PEN',
  exchangeRate: null,
  spentAt: null,
  expenseType: null,
  installment: null,
  period: null,
  merchant: null,
  operationNumber: null,
  notes: null,
  personId: null,
  paymentMethodId: null,
  creditCardId: null,
  categoryId: null,
  confidence: '{"amount":0.95}',
  missingFields: '["personId"]',
  confirmedAt: null,
  createdAt: new Date('2026-09-22T12:00:00.000Z'),
  updatedAt: new Date('2026-09-22T12:00:00.000Z'),
}
