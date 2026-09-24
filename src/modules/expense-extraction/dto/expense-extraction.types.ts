import { z } from 'zod'

import { AiProvider } from '@/commons/constants/ai.constant'
import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import { CatalogKind, ExpenseField } from '@/commons/constants/expense-extraction.constant'
import { SharedExpense } from '@/db/models/expense-draft/expenseDraftDB.dto'

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
  isPrimary?: boolean // the card of screenshots that do not show which one (D47)
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
  sharedWith?: SharedExpense | null // D74: the parts of other people, from the AI (the local parser wins)
  confidence: Record<string, number>
  missingFields: ExpenseField[]
  lowConfidenceFields: ExpenseField[]
}

// A file downloaded from a channel, in memory: an image for the AI or a voice note to transcribe
export interface MediaFile {
  mimeType: string
  data: string // base64
}

export type ExpenseExtractionImage = MediaFile

export interface ExpenseExtractionInput {
  text?: string
  images?: ExpenseExtractionImage[]
  draftId?: string
  draft?: Partial<ResolvedExpenseFields> // expense being corrected
}

export interface ReceivedPayment {
  amount: number
  currency: string | null
  sender: string
  spentAt: string | null
  operationNumber: string | null
}

export interface ExpenseExtractionResult {
  expenses: ResolvedExpense[]
  unreadable: string[] // list items the AI could not read (P21)
  received: ReceivedPayment[] // "Te yapearon": money received, a possible debt payment (P17)
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
