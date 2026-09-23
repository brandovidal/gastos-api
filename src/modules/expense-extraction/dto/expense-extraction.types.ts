import { z } from 'zod'

import { AiProvider } from '@/commons/constants/ai.constant'
import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import { CatalogKind, ExpenseField } from '@/commons/constants/expense-extraction.constant'

import { extractedExpenseSchema } from '../validations/expense-extraction.validation'

export type ExtractedExpense = z.infer<typeof extractedExpenseSchema>

export interface CatalogEntry {
  ref: string
  kind: CatalogKind
  id: string
  name: string
  aliases: string[]
  isDefault?: boolean // the default person
  paymentType?: PaymentMethodType // payment methods
  showInBot?: boolean // payment methods offered as quick replies
  billingCloseDay?: number | null // credit cards
}

export interface ExtractionCatalog {
  entries: CatalogEntry[]
  promptText: string
}

// Expense fields with real database ids, ready to be stored in ExpenseDraft
export interface ResolvedExpenseFields {
  destination: string | null
  description: string | null
  amount: number | null
  currency: string | null
  spentAt: string | null // YYYY-MM-DD
  expenseType: string | null
  installment: string | null
  period: string | null
  personId: string | null
  paymentMethodId: string | null
  categoryId: string | null
  merchant: string | null
  operationNumber: string | null
  notes: string | null
}

export interface ResolvedExpense extends ResolvedExpenseFields {
  confidence: Record<string, number>
  missingFields: ExpenseField[]
  lowConfidenceFields: ExpenseField[]
}

export interface ExpenseExtractionImage {
  mimeType: string
  data: string // base64
}

export interface ExpenseExtractionInput {
  text?: string
  images?: ExpenseExtractionImage[]
  draftId?: string
  draft?: Partial<ResolvedExpenseFields> // expense being corrected
}

export interface ExpenseExtractionResult {
  expenses: ResolvedExpense[]
  provider: AiProvider
  model: string
}

// /uso: today's calls of a model against its free daily quota
export interface AiModelUsage {
  provider: string
  model: string
  used: number
  dailyLimit: number
  // calls allowed before the quota guard skips the model (AI_QUOTA_USAGE_THRESHOLD)
  usableLimit: number
}
