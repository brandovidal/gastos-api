import { ExpenseFile } from '@/generated/prisma/client'

import { ExpenseFileChannel, ExpenseFileInputType, ExpenseFileStatus } from '@/commons/constants/expense-file.constant'

import { CreateExpenseFileDbDto } from '../expenseFileDB.dto'

export const mockCreateExpenseFile: CreateExpenseFileDbDto = {
  channel: ExpenseFileChannel.TELEGRAM,
  chatId: '123456',
  messageId: '42',
  inputType: ExpenseFileInputType.TEXT,
  rawText: 'almuerzo 25 soles yape',
}

export const mockExpenseFileRow: ExpenseFile = {
  id: 'file-1',
  channel: ExpenseFileChannel.TELEGRAM,
  chatId: '123456',
  messageId: '42',
  itemIndex: 0,
  inputType: ExpenseFileInputType.TEXT,
  documentType: null,
  rawText: 'almuerzo 25 soles yape',
  mediaFileId: null,
  status: ExpenseFileStatus.DRAFT,
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
