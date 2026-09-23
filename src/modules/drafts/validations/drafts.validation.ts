import { z } from 'zod'

import {
  Currency,
  ExpenseDestination,
  ExpenseType,
  INSTALLMENT_REGEX,
  SubscriptionPeriod,
} from '@/commons/constants/expense.constant'

// Borrador tabs (D50, D57)
export enum DraftTab {
  REVIEW = 'review', // open, kept for later or expired
  FAILED = 'failed', // the AI could not read it
  DISCARDED = 'discarded',
}

const id = z.string().min(1)

// The fields of an expense as the web form sends them; missing ones stay null and are asked for on save
export const draftFieldsSchema = z.object({
  destination: z.enum(ExpenseDestination).nullable().optional(),
  description: z.string().trim().min(1).max(120).nullable().optional(),
  amount: z.number().positive().nullable().optional(),
  currency: z.enum(Currency).nullable().optional(),
  spentAt: z.iso.date().nullable().optional(),
  expenseType: z.enum(ExpenseType).nullable().optional(),
  installment: z.string().regex(INSTALLMENT_REGEX, 'Use n/m, e.g. 1/3').nullable().optional(),
  period: z.enum(SubscriptionPeriod).nullable().optional(),
  personId: id.nullable().optional(),
  paymentMethodId: id.nullable().optional(),
  categoryId: id.nullable().optional(),
  merchant: z.string().trim().max(120).nullable().optional(),
  operationNumber: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
})

export const draftListQuerySchema = z.object({
  tab: z.enum(DraftTab).default(DraftTab.REVIEW),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
})
