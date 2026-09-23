import { z } from 'zod'

import {
  CREDIT_CARD_EXPENSE_STATUSES,
  Currency,
  ExpenseType,
  FIXED_COST_STATUSES,
  INSTALLMENT_REGEX,
  PaymentStatus,
  ReceivableStatus,
  RecurringTargetType,
  SUBSCRIPTION_STATUSES,
  SubscriptionPeriod,
} from '@/commons/constants/expense.constant'
import { ExpenseResource } from '@/db/models/expense-record/expenseRecordDB.repository'

// YYYY-MM-DD from the web forms, stored as a date at 00:00 UTC
const date = z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`))
const id = z.string().min(1)
const month = z.number().int().min(1).max(12)
const year = z.number().int().min(2020).max(2100)

const money = {
  description: z.string().trim().min(1).max(120),
  amount: z.number().positive(),
  currency: z.enum(Currency).default(Currency.PEN),
  exchangeRate: z.number().positive().nullable().optional(),
  personId: id,
  notes: z.string().trim().max(500).nullable().optional(),
}

const expense = {
  ...money,
  expenseType: z.enum(ExpenseType).optional(),
  categoryId: id.nullable().optional(),
  installment: z.string().regex(INSTALLMENT_REGEX, 'Use n/m, e.g. 1/3').nullable().optional(),
}

const paymentPeriod = { paymentMonth: month, paymentYear: year }

// Each table allows its own subset of payment statuses (Notion boards)
const statusOf = (allowed: readonly PaymentStatus[]) =>
  z.enum(PaymentStatus).refine((status) => allowed.includes(status), { message: `One of: ${allowed.join(', ')}` })

export const EXPENSE_SCHEMAS = {
  [ExpenseResource.DAILY]: z.object({
    ...expense,
    spentAt: date,
    paymentMethodId: id,
    merchant: z.string().trim().max(120).nullable().optional(),
    operationNumber: z.string().trim().max(40).nullable().optional(),
  }),
  [ExpenseResource.FIXED_COST]: z.object({
    ...expense,
    ...paymentPeriod,
    categoryId: id,
    paymentMethodId: id.nullable().optional(),
    paymentStatus: statusOf(FIXED_COST_STATUSES).optional(),
    paymentDate: date.nullable().optional(),
    dueDate: date.nullable().optional(),
    attentionDate: date.nullable().optional(),
  }),
  [ExpenseResource.SUBSCRIPTION]: z.object({
    ...expense,
    ...paymentPeriod,
    period: z.enum(SubscriptionPeriod),
    paymentMethodId: id.nullable().optional(),
    paymentStatus: statusOf(SUBSCRIPTION_STATUSES).optional(),
    paymentDate: date.nullable().optional(),
    dueDate: date.nullable().optional(),
  }),
  [ExpenseResource.CREDIT_CARD]: z.object({
    ...expense,
    ...paymentPeriod,
    paymentMethodId: id,
    paymentStatus: statusOf(CREDIT_CARD_EXPENSE_STATUSES).optional(),
    processDate: date.nullable().optional(),
  }),
  [ExpenseResource.RECEIVABLE]: z.object({
    ...money,
    status: z.enum(ReceivableStatus).optional(),
    dueDate: date.nullable().optional(),
    paidDate: date.nullable().optional(),
    paidAmount: z.number().min(0).nullable().optional(),
  }),
  [ExpenseResource.RECURRING]: z.object({
    ...money,
    targetType: z.enum(RecurringTargetType),
    expenseType: z.enum(ExpenseType).optional(),
    categoryId: id.nullable().optional(),
    paymentMethodId: id.nullable().optional(),
    dayOfMonth: z.number().int().min(1).max(31),
    isActive: z.boolean().optional(),
  }),
} satisfies Record<ExpenseResource, z.ZodObject>

export const expenseListQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  personId: z.string().min(1).optional(),
  paymentMethodId: z.string().min(1).optional(),
})

export const extractExpenseSchema = z.object({
  text: z.string().trim().min(1).max(1000),
})
