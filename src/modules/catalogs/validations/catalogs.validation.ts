import { z } from 'zod'

import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import { dateTimeSchema } from '@/commons/helpers/api-response.helper'

const day = z.number().int().min(1).max(31)
const aliases = z.array(z.string().trim().min(1).max(40)).max(20)

export const personSchema = z.object({
  name: z.string().trim().min(1).max(60),
  aliases: aliases.optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export const paymentMethodSchema = z.object({
  name: z.string().trim().min(1).max(40),
  type: z.enum(PaymentMethodType),
  code: z.string().trim().min(1).max(10).nullable().optional(),
  aliases: aliases.optional(),
  isActive: z.boolean().optional(),
  showInBot: z.boolean().optional(),
  // credit cards: the closing day decides the billing month (D22)
  billingCloseDay: day.nullable().optional(),
  paymentDueDay: day.nullable().optional(),
  color: z.string().trim().max(20).nullable().optional(),
})

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().trim().max(20).optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  isDefault: z.boolean().optional(),
  budgetGroupId: z.string().min(1).nullable().optional(),
})

export const budgetGroupSchema = z.object({
  name: z.string().trim().min(1).max(40),
  emoji: z.string().trim().max(8).optional(),
  percentage: z.number().min(0).max(100).optional(),
  order: z.number().int().min(0).optional(),
})

// ==================== Responses (Swagger / kogane-app types) ====================

const record = { id: z.string(), createdAt: dateTimeSchema, updatedAt: dateTimeSchema }

export const personResponseSchema = z.object({
  ...record,
  name: z.string(),
  aliases: z.array(z.string()),
  isActive: z.boolean(),
  isDefault: z.boolean(),
})

export const paymentMethodResponseSchema = z.object({
  ...record,
  name: z.string(),
  type: z.enum(PaymentMethodType),
  code: z.string().nullable(),
  aliases: z.array(z.string()),
  isActive: z.boolean(),
  showInBot: z.boolean(),
  billingCloseDay: z.number().int().nullable(),
  paymentDueDay: z.number().int().nullable(),
  color: z.string().nullable(),
})

export const categoryResponseSchema = z.object({
  ...record,
  name: z.string(),
  color: z.string(),
  icon: z.string().nullable(),
  isDefault: z.boolean(),
  budgetGroupId: z.string().nullable(),
})

export const budgetGroupResponseSchema = z.object({
  ...record,
  name: z.string(),
  emoji: z.string(),
  percentage: z.number(),
  order: z.number().int(),
})
