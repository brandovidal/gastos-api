import { z } from 'zod'

import { AiProvider } from '@/commons/constants/ai.constant'
import { CatalogKind, ExpenseField } from '@/commons/constants/expense-extraction.constant'

import { extractedExpenseSchema } from '../validations/expense-extraction.validation'

export type ExtractedExpense = z.infer<typeof extractedExpenseSchema>

export interface CatalogEntry {
  ref: string
  kind: CatalogKind
  id: string
  name: string
  aliases: string[]
  creditCardId?: string | null // payment methods linked to a credit card
  isDefault?: boolean // the default person
}

export interface ExtractionCatalog {
  entries: CatalogEntry[]
  promptText: string
}

// Expense fields with real database ids, ready to be stored in ExpenseFile
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
  creditCardId: string | null
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
  expenseFileId?: string
  draft?: Partial<ResolvedExpenseFields> // expense being corrected
}

export interface ExpenseExtractionResult {
  expenses: ResolvedExpense[]
  provider: AiProvider
  model: string
}
