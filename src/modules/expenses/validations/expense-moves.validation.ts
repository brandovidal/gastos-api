import { z } from 'zod'

import { SubscriptionKind, SubscriptionPeriod } from '@/commons/constants/expense.constant'
import { ExpenseResource } from '@/db/models/expense-record/expenseRecordDB.repository'

const movable = z.enum([ExpenseResource.FIXED_COST, ExpenseResource.SUBSCRIPTION])
const period = z.object({ month: z.number().int(), year: z.number().int() })

// "Pasar a…" (D106): the whole series of a row (same table, description and person) and its template
export const moveSeriesSchema = z
  .object({
    resource: movable.describe('Table of the row the user picked'),
    id: z.string().min(1),
    to: movable,
    kind: z.enum(SubscriptionKind).optional().describe('Required when moving to subscriptions'),
    period: z
      .enum(SubscriptionPeriod)
      .optional()
      .describe('Subscriptions only; monthly when it comes from a fixed cost'),
    categoryId: z.string().min(1).optional().describe('For rows without a category when moving to fixed costs'),
    dryRun: z.boolean().optional().describe('Only count what would move (the confirmation of the dialog)'),
  })
  .superRefine((body, context) => {
    if (body.to === ExpenseResource.SUBSCRIPTION && !body.kind) {
      context.addIssue({ code: 'custom', path: ['kind'], message: 'Required when moving to subscriptions' })
    }
    if (body.to === ExpenseResource.FIXED_COST && body.resource === ExpenseResource.FIXED_COST) {
      context.addIssue({ code: 'custom', path: ['to'], message: 'The row is already a fixed cost' })
    }
  })

export const moveSeriesResponseSchema = z.object({
  dryRun: z.boolean(),
  count: z.number().int().describe('Rows of the series'),
  from: period.nullable().describe('First payment month of the series'),
  until: period.nullable().describe('Last payment month of the series'),
  templates: z.number().int().describe('Recurring templates moved with it'),
  withoutCategory: z.number().int().describe('Rows that need categoryId to become fixed costs'),
  blocked: z
    .array(z.object({ id: z.string(), month: z.number().int(), year: z.number().int() }))
    .describe('Rows with an /editar copy open: finish or cancel it first'),
})
