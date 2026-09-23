import { z } from 'zod'

import { DebtDirection, DebtStatus, DebtTiming } from '@/commons/constants/debt.constant'
import { Currency } from '@/commons/constants/expense.constant'
import { dateTimeSchema } from '@/commons/helpers/api-response.helper'

// YYYY-MM-DD from the web forms, stored as a date at 00:00 UTC
const date = z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`))
const amount = z.number().positive()

export const debtListQuerySchema = z.object({
  personId: z.string().min(1).optional(),
  direction: z.enum(DebtDirection).optional(),
  status: z.enum(DebtStatus).optional(),
})

const debtFields = {
  description: z.string().trim().min(1),
  amount,
  currency: z.enum(Currency).optional(),
  exchangeRate: z.number().positive().nullable().optional(),
  personId: z.string().min(1),
  paymentMonth: z.number().int().min(1).max(12),
  paymentYear: z.number().int().min(2000).max(2100),
  dueDate: date.nullable().optional(),
  notes: z.string().trim().nullable().optional(),
}

// "installments: 3" creates three rows, one per month from paymentMonth (D60); amount is each installment's
export const createDebtSchema = z.object({
  ...debtFields,
  direction: z.enum(DebtDirection),
  installments: z.number().int().min(1).max(120).optional(),
})

// One installment at a time; paidAmount and status follow the payments and cannot be edited
export const updateDebtSchema = z
  .object({
    ...debtFields,
    installment: z
      .string()
      .regex(/^\d{1,3}\/\d{1,3}$/)
      .nullable(),
  })
  .partial()

export const debtPaymentSchema = z.object({
  amount,
  paidAt: date.optional(),
  paymentMethodId: z.string().min(1).nullable().optional(),
  notes: z.string().trim().nullable().optional(),
})

// ==================== Responses (Swagger / kogane-app types) ====================

export const debtResponseSchema = z.object({
  id: z.string(),
  direction: z.enum(DebtDirection),
  description: z.string(),
  amount: z.number(),
  currency: z.string(),
  exchangeRate: z.number().nullable(),
  amountInPen: z.number().nullable(),
  installment: z.string().nullable(),
  paymentMonth: z.number().int(),
  paymentYear: z.number().int(),
  dueDate: dateTimeSchema.nullable(),
  status: z.enum(DebtStatus),
  paidAmount: z.number(),
  paidDate: dateTimeSchema.nullable(),
  personId: z.string(),
  notes: z.string().nullable(),
  draftId: z.string().nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
})

// Listed with the person, the balance and the timing computed from today
export const debtViewResponseSchema = debtResponseSchema.extend({
  person: z.object({ id: z.string(), name: z.string() }),
  balance: z.number(),
  timing: z.enum(DebtTiming),
})

export const debtPaymentResponseSchema = z.object({
  id: z.string(),
  debtId: z.string(),
  amount: z.number(),
  paidAt: dateTimeSchema,
  paymentMethodId: z.string().nullable(),
  batchId: z.string().nullable(),
  confirmedAt: dateTimeSchema.nullable(),
  notes: z.string().nullable(),
  createdAt: dateTimeSchema,
})

export const debtDetailResponseSchema = debtViewResponseSchema.extend({ payments: z.array(debtPaymentResponseSchema) })

export const debtSummaryResponseSchema = z.object({
  personId: z.string(),
  name: z.string(),
  owedToMe: z.number(),
  iOwe: z.number(),
  net: z.number().describe('Positive: the person owes the user'),
  late: z.number(),
  dueThisMonth: z.number(),
})
