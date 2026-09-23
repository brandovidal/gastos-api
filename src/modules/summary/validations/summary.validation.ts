import { z } from 'zod'

import { dateTimeSchema } from '@/commons/helpers/api-response.helper'

const month = z.coerce.number().int().min(1).max(12)
const year = z.coerce.number().int().min(2020).max(2100)

export const summaryQuerySchema = z.object({ month, year })

export const monthlyBudgetSchema = z.object({
  month,
  year,
  salary: z.number().min(0),
  limitPercent: z.number().min(0).max(100).optional(),
})

// ==================== Responses (Swagger / kogane-app types) ====================

export const summaryResponseSchema = z.object({
  month: z.number().int(),
  year: z.number().int(),
  totals: z.array(
    z.object({
      destination: z.string(),
      currency: z.string(),
      personId: z.string(),
      total: z.number(),
      count: z.number().int(),
    }),
  ),
  spentPen: z.number(),
  budget: z.object({ salary: z.number(), limitPercent: z.number(), limit: z.number().nullable() }).nullable(),
  surplus: z.number().nullable().describe('Salary minus what was spent, like the Notion Resumen'),
  budgetGroups: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      emoji: z.string(),
      percentage: z.number(),
      order: z.number().int(),
      amount: z.number().nullable(),
      createdAt: dateTimeSchema,
      updatedAt: dateTimeSchema,
    }),
  ),
})

export const monthlyBudgetResponseSchema = z.object({
  id: z.string(),
  month: z.number().int(),
  year: z.number().int(),
  salary: z.number(),
  limitPercent: z.number(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
})
