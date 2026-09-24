import { z } from 'zod'

import {
  Currency,
  ExpenseDestination,
  ExpenseType,
  INSTALLMENT_REGEX,
  SubscriptionPeriod,
} from '@/commons/constants/expense.constant'
import { MAX_EXPENSES_PER_MESSAGE } from '@/commons/constants/expense-extraction.constant'

const confidenceValue = z.number().min(0).max(1).optional()

// One optional key per field. Not z.record(): Gemini rejects schema-valued additionalProperties (400 INVALID_ARGUMENT)
export const CONFIDENCE_KEYS = [
  'destination',
  'description',
  'amount',
  'currency',
  'spentAt',
  'expenseType',
  'installment',
  'period',
  'personRef',
  'paymentMethodRef',
  'categoryRef',
  'merchant',
  'operationNumber',
  'notes',
] as const

const confidenceSchema = z.object(
  Object.fromEntries(CONFIDENCE_KEYS.map((key) => [key, confidenceValue])) as {
    [K in (typeof CONFIDENCE_KEYS)[number]]: typeof confidenceValue
  },
)

// What the AI returns for each expense. Catalog values come as short refs (p1, pm2…), never database ids.
export const extractedExpenseSchema = z.object({
  destination: z.enum(ExpenseDestination).nullable(),
  description: z.string().min(1).nullable(),
  amount: z.number().positive().nullable(),
  currency: z.enum(Currency).nullable(),
  spentAt: z.iso.date().nullable(),
  expenseType: z.enum(ExpenseType).nullable(),
  installment: z.string().regex(INSTALLMENT_REGEX).nullable(),
  period: z.enum(SubscriptionPeriod).nullable(),
  personRef: z.string().nullable(),
  paymentMethodRef: z.string().nullable(),
  categoryRef: z.string().nullable(),
  merchant: z.string().nullable(),
  operationNumber: z.string().nullable(),
  notes: z.string().nullable(),
  confidence: confidenceSchema,
})

// Money received in a screenshot ("Te yapearon"): not an expense, but it can pay a debt (P17)
export const receivedPaymentSchema = z.object({
  amount: z.number().positive(),
  currency: z.enum(Currency).nullable(),
  sender: z.string().min(1),
  spentAt: z.iso.date().nullable(),
  operationNumber: z.string().nullable(),
})

const extractionShape = {
  // Items of a list whose amount is covered or cut off: named so the user can send them again (P21)
  unreadable: z.array(z.string()).optional(),
  received: z.array(receivedPaymentSchema).optional(),
}

export const expenseExtractionSchema = z.object({
  expenses: z.array(extractedExpenseSchema).max(MAX_EXPENSES_PER_MESSAGE),
  ...extractionShape,
})

// Sent to Gemini as responseJsonSchema and to Groq inside the instructions. Built without maxItems:
// Gemini answers 400 INVALID_ARGUMENT for this schema when the array has maxItems (checked 2026-09-23).
// The 10 items limit is still enforced when the answer is validated with expenseExtractionSchema.
export const expenseExtractionJsonSchema = (() => {
  const { $schema: _schema, ...jsonSchema } = z.toJSONSchema(
    z.object({ expenses: z.array(extractedExpenseSchema), ...extractionShape }),
  ) as Record<string, unknown>
  return jsonSchema
})()
