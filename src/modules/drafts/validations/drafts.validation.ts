import { z } from 'zod'

import {
  Currency,
  ExpenseDestination,
  ExpenseType,
  INSTALLMENT_REGEX,
  SubscriptionPeriod,
} from '@/commons/constants/expense.constant'
import { dateTimeSchema } from '@/commons/helpers/api-response.helper'

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

// ==================== Responses (Swagger / kogane-app types) ====================

const nullableString = z.string().nullable()

export const draftResponseSchema = z.object({
  id: z.string(),
  channel: z.string(),
  chatId: z.string(),
  messageId: z.string(),
  itemIndex: z.number().int(),
  inputType: z.string(),
  documentType: nullableString,
  rawText: nullableString,
  mediaFileId: nullableString,
  mediaUniqueId: nullableString,
  fileId: nullableString,
  status: z.string(),
  pendingField: nullableString,
  destination: nullableString,
  description: nullableString,
  amount: z.number().nullable(),
  currency: nullableString,
  exchangeRate: z.number().nullable(),
  spentAt: dateTimeSchema.nullable(),
  expenseType: nullableString,
  installment: nullableString,
  period: nullableString,
  merchant: nullableString,
  operationNumber: nullableString,
  notes: nullableString,
  personId: nullableString,
  paymentMethodId: nullableString,
  categoryId: nullableString,
  confidence: z.record(z.string(), z.number()),
  missingFields: z.array(z.string()),
  confirmedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
})

export const draftListResponseSchema = z.object({ items: z.array(draftResponseSchema), total: z.number().int() })

// Signed link of 10 minutes to the screenshot or voice note (D58); null without file or once it expired
export const draftDetailResponseSchema = draftResponseSchema.extend({ mediaUrl: z.string().nullable() })

export const draftSavedResponseSchema = z.object({
  draftId: z.string(),
  destination: nullableString,
  recordId: z.string(),
})
