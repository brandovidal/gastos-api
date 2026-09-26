import { z } from 'zod'

import { AuditAction, AuditSource } from '@/commons/constants/audit.constant'
import { dateTimeSchema } from '@/commons/helpers/api-response.helper'

// YYYY-MM-DD from the web filters, as a date at 00:00 UTC (dates are stored in UTC)
const day = z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`))

export const historyQuerySchema = z.object({
  entity: z.string().min(1).optional().describe('The table: exp_fixed_costs, cat_people…'),
  id: z.string().min(1).optional().describe('One record (with entity)'),
  source: z.enum(AuditSource).optional(),
  from: day.optional(),
  to: day.optional().describe('Inclusive: the whole day'),
  page: z.coerce.number().int().min(1).default(1),
})

export const historyTimelineQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1) })

export const historyEntityParamSchema = z.object({
  entity: z.string().min(1),
  id: z.string().min(1),
})

// ==================== Responses (Swagger / kogane-app types) ====================

export const historyChangeFieldSchema = z.object({
  field: z.string(),
  before: z.unknown().describe('null on a create'),
  after: z.unknown().describe('null on a delete'),
})

export const historyEntrySchema = z.object({
  id: z.string(),
  entity: z.string(),
  entityId: z.string(),
  action: z.enum(AuditAction),
  source: z.enum(AuditSource),
  actorId: z.string().nullable(),
  batchId: z.string().nullable(),
  createdAt: dateTimeSchema,
  title: z.string().nullable().describe('What the record is called (its name or description), if it is known'),
  changes: z.array(historyChangeFieldSchema),
})

export const historyPageSchema = z.object({
  items: z.array(historyEntrySchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  labels: z.record(z.string(), z.string()).describe('id → name of the people, cards, categories… the changes mention'),
})
