import { z } from 'zod'

import { PaymentMethodType } from '@/commons/constants/catalog.constant'

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
