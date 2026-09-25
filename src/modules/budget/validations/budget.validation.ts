import { z } from 'zod'

import { BudgetStatus } from '@/commons/constants/budget.constant'
import { Currency } from '@/commons/constants/expense.constant'
import { dateTimeSchema } from '@/commons/helpers/api-response.helper'

const month = z.coerce.number().int().min(1).max(12)
const year = z.coerce.number().int().min(2020).max(2100)
// YYYY-MM-DD from the web forms, stored as a date at 00:00 UTC
const date = z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`))

export const incomeListQuerySchema = z.object({ month, year })

// month/year default to the month of receivedAt
export const createIncomeSchema = z.object({
  description: z.string().trim().min(1),
  amount: z.number().positive(),
  currency: z.enum(Currency).optional(),
  receivedAt: date,
  month: month.optional(),
  year: year.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
})

export const updateIncomeSchema = createIncomeSchema.partial()

export const categoryBudgetQuerySchema = z.object({ month, year })

// Without month and year: the limit of every month; with them, only that month (replaces the general one)
export const upsertCategoryBudgetSchema = z
  .object({
    categoryId: z.string().min(1),
    monthlyLimit: z.number().min(0),
    alertThreshold: z.number().min(1).max(100).optional(),
    month: month.nullable().optional(),
    year: year.nullable().optional(),
  })
  .refine((value) => (value.month == null) === (value.year == null), {
    message: 'month and year go together',
    path: ['year'],
  })

// ==================== Responses (Swagger / kogane-app types) ====================

export const incomeResponseSchema = z.object({
  id: z.string(),
  description: z.string(),
  amount: z.number(),
  currency: z.string(),
  receivedAt: dateTimeSchema,
  month: z.number().int(),
  year: z.number().int(),
  notes: z.string().nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
})

export const categoryBudgetResponseSchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  monthlyLimit: z.number(),
  alertThreshold: z.number(),
  month: z.number().int().nullable(),
  year: z.number().int().nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
})

export const categoryBudgetLineSchema = z.object({
  categoryId: z.string().nullable().describe('null: expenses without category'),
  name: z.string(),
  color: z.string(),
  icon: z.string().nullable(),
  budgetGroupId: z.string().nullable(),
  spent: z.number(),
  limit: z.number().nullable(),
  budgetId: z.string().nullable().describe('The category budget row of the limit (PUT or DELETE it)'),
  limitMonthOnly: z.boolean().describe('The limit is only for this month (otherwise for every month)'),
  alertThreshold: z.number(),
  percent: z.number().nullable(),
  status: z.enum(BudgetStatus).nullable().describe('null without limit'),
})

// Configuración ▸ Presupuesto (D96, D107): what adds to the budget besides fixed costs, cards and day to day
export const budgetSettingsSchema = z.object({
  recurringCount: z
    .boolean()
    .describe('Recurrentes (service, annual, other) add to the budget unless paid with a credit card'),
  platformsCount: z.boolean().describe('Plataformas add to the budget unless paid with a credit card'),
})

export const updateBudgetSettingsSchema = budgetSettingsSchema.partial()
