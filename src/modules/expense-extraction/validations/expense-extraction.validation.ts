import { z } from 'zod'

import {
  Currency,
  ExpenseDestination,
  ExpenseType,
  INSTALLMENT_REGEX,
  SubscriptionPeriod,
} from '@/commons/constants/expense.constant'
import { MAX_EXPENSES_PER_MESSAGE } from '@/commons/constants/expense-extraction.constant'

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
  creditCardRef: z.string().nullable(),
  categoryRef: z.string().nullable(),
  merchant: z.string().nullable(),
  operationNumber: z.string().nullable(),
  notes: z.string().nullable(),
  confidence: z.record(z.string(), z.number().min(0).max(1)),
})

export const expenseExtractionSchema = z.object({
  expenses: z.array(extractedExpenseSchema).max(MAX_EXPENSES_PER_MESSAGE),
})

// Sent to Gemini as responseJsonSchema and to Groq inside the instructions
export const expenseExtractionJsonSchema = (() => {
  const { $schema: _schema, ...jsonSchema } = z.toJSONSchema(expenseExtractionSchema) as Record<string, unknown>
  return jsonSchema
})()
