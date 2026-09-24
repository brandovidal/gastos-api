import { z } from 'zod'

import { StatementRowResult, StatementSource, StatementStatus } from '@/commons/constants/statement.constant'
import { dateTimeSchema } from '@/commons/helpers/api-response.helper'

export const uploadStatementSchema = z.object({
  password: z.string().trim().max(40).optional(),
  paymentMethodId: z.string().min(1).optional(),
})

export const createNewRowsSchema = z.object({
  rowIds: z.array(z.string().min(1)).optional().describe('Only these rows; without it every new row'),
})

export const rowResultSchema = z.object({
  result: z.enum([StatementRowResult.IGNORED, StatementRowResult.NEW]),
})

// ==================== Responses (Swagger / kogane-app types) ====================

const statementFields = {
  id: z.string(),
  paymentMethodId: z.string(),
  cardName: z.string(),
  paymentMonth: z.number().int(),
  paymentYear: z.number().int(),
  periodStart: dateTimeSchema.nullable(),
  periodEnd: dateTimeSchema.nullable(),
  dueDate: dateTimeSchema.nullable(),
  totalDue: z.number().nullable(),
  minimumDue: z.number().nullable(),
  currency: z.string(),
  source: z.enum(StatementSource),
  fileId: z.string().nullable(),
  status: z.enum(StatementStatus),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
}

export const statementRowResponseSchema = z.object({
  id: z.string(),
  statementId: z.string(),
  date: dateTimeSchema.nullable(),
  description: z.string(),
  amount: z.number(),
  currency: z.string(),
  installment: z.string().nullable(),
  result: z.enum(StatementRowResult),
  expenseId: z.string().nullable(),
  createdAt: dateTimeSchema,
})

export const statementResponseSchema = z.object({
  ...statementFields,
  rows: z.array(statementRowResponseSchema),
  missing: z
    .array(
      z.object({
        id: z.string(),
        description: z.string(),
        amount: z.number(),
        processDate: z.string().nullable(),
        installment: z.string().nullable(),
      }),
    )
    .describe('Card expenses of the month that are not in the statement'),
  koganeTotal: z.number().describe('Card expenses registered for that payment month'),
  difference: z.number().nullable().describe('totalDue − koganeTotal'),
})

export const statementSummaryResponseSchema = z.object({
  ...statementFields,
  counts: z.object({
    matched: z.number().int(),
    new: z.number().int(),
    created: z.number().int(),
    ignored: z.number().int(),
  }),
})
