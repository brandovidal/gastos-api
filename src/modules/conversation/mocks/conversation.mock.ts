import { ExpenseDestination, ExpenseType } from '@/commons/constants/expense.constant'
import {
  ExpenseDraftChannel,
  ExpenseDraftInputType,
  ExpenseDraftStatus,
} from '@/commons/constants/expense-draft.constant'
import { ChannelMessageType } from '@/commons/constants/conversation.constant'
import { ExpenseDraftDbDto } from '@/db/models/expense-draft/expenseDraftDB.dto'
import { buildExtractionCatalog } from '@/modules/expense-extraction/expense-extraction.catalog'
import { mockCatalogSource } from '@/modules/expense-extraction/mocks/expense-extraction.mock'
import { ResolvedExpense } from '@/modules/expense-extraction/dto/expense-extraction.types'

import { ChannelMessage } from '../dto/conversation.types'

export const CHAT_ID = '555'
export const FILE_ID = 'ckdailyexpense000000000001' // cuid-like: 25+ chars

export const mockCatalog = buildExtractionCatalog(mockCatalogSource)

export const buildExpenseDraft = (overrides: Partial<ExpenseDraftDbDto> = {}): ExpenseDraftDbDto => ({
  id: FILE_ID,
  channel: ExpenseDraftChannel.TELEGRAM,
  chatId: CHAT_ID,
  messageId: '10',
  itemIndex: 0,
  batchId: null,
  inputType: ExpenseDraftInputType.TEXT,
  documentType: null,
  rawText: 'almuerzo 25 soles con yape',
  mediaFileId: null,
  mediaUniqueId: null,
  fileId: null,
  status: ExpenseDraftStatus.AWAITING_CONFIRMATION,
  pendingField: null,
  destination: ExpenseDestination.FIXED_COST,
  description: 'Almuerzo',
  amount: 25,
  currency: 'PEN',
  exchangeRate: null,
  spentAt: new Date('2026-09-22T00:00:00.000Z'),
  expenseType: ExpenseType.ESSENTIAL,
  installment: null,
  period: null,
  merchant: null,
  operationNumber: null,
  notes: null,
  personId: 'person-danery',
  paymentMethodId: 'method-yape',
  categoryId: 'category-food',
  confidence: {},
  missingFields: [],
  confirmedAt: null,
  createdAt: new Date('2026-09-22T12:00:00.000Z'),
  updatedAt: new Date('2026-09-22T12:00:00.000Z'),
  ...overrides,
})

export const buildResolvedExpense = (overrides: Partial<ResolvedExpense> = {}): ResolvedExpense => ({
  destination: ExpenseDestination.FIXED_COST,
  description: 'Almuerzo',
  amount: 25,
  currency: 'PEN',
  spentAt: '2026-09-22',
  expenseType: ExpenseType.ESSENTIAL,
  installment: null,
  period: null,
  personId: 'person-danery',
  paymentMethodId: 'method-yape',
  categoryId: 'category-food',
  merchant: null,
  operationNumber: null,
  notes: null,
  confidence: {},
  missingFields: [],
  lowConfidenceFields: [],
  ...overrides,
})

export const textMessage = (text: string, messageId = '11'): ChannelMessage => ({
  channel: ExpenseDraftChannel.TELEGRAM,
  chatId: CHAT_ID,
  messageId,
  type: ChannelMessageType.TEXT,
  text,
})
