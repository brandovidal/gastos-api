import { z } from 'zod'

import { DEFAULT_HISTORY_MONTHS, MAX_HISTORY_MONTHS } from '@/commons/constants/budget.constant'
import { dateTimeSchema } from '@/commons/helpers/api-response.helper'
import { categoryBudgetLineSchema, incomeResponseSchema } from '@/modules/budget/validations/budget.validation'

const month = z.coerce.number().int().min(1).max(12)
const year = z.coerce.number().int().min(2020).max(2100)

export const summaryQuerySchema = z.object({ month, year })

export const historyQuerySchema = z.object({
  month,
  year,
  months: z.coerce.number().int().min(1).max(MAX_HISTORY_MONTHS).default(DEFAULT_HISTORY_MONTHS),
})

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
  spentPen: z.number().describe('PEN spent: day to day + fixed costs + cards (subscriptions are card charges, D46)'),
  budget: z
    .object({
      salary: z.number(),
      limitPercent: z.number(),
      limit: z.number(),
      isProposal: z.boolean().describe('No salary for this month: the latest one, saved with PUT /v1/summary/budget'),
    })
    .nullable(),
  incomes: z.array(incomeResponseSchema),
  extraIncome: z.number().describe('PEN extra incomes of the month'),
  surplus: z.number().nullable().describe('Salary + extra incomes − spent (D65)'),
  byCategory: z.array(categoryBudgetLineSchema),
  budgetGroups: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      emoji: z.string(),
      percentage: z.number(),
      order: z.number().int(),
      amount: z.number().nullable().describe('Salary × percentage'),
      spent: z.number(),
      percent: z.number().nullable(),
      createdAt: dateTimeSchema,
      updatedAt: dateTimeSchema,
    }),
  ),
})

export const summaryHistoryResponseSchema = z.object({
  month: z.number().int(),
  year: z.number().int(),
  salary: z.number().nullable(),
  extraIncome: z.number(),
  spentPen: z.number(),
  surplus: z.number().nullable(),
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
