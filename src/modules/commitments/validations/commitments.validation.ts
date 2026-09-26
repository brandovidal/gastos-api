import { z } from 'zod'

import { CommitmentKind, CommitmentStatus, CommitmentSubtype } from '@/commons/constants/commitment.constant'
import { Currency, PaymentStatus } from '@/commons/constants/expense.constant'
import { dateTimeSchema } from '@/commons/helpers/api-response.helper'

// YYYY-MM-DD from the web forms, stored as a date at 00:00 UTC
const date = z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`))
const amount = z.number().positive()

export const commitmentListQuerySchema = z.object({
  kind: z.enum(CommitmentKind).optional(),
  status: z.enum(CommitmentStatus).optional(),
})

const commitmentFields = {
  name: z.string().trim().min(1).max(80),
  subtype: z.enum(CommitmentSubtype),
  entity: z.string().trim().max(80).nullable().optional(),
  currency: z.enum(Currency).optional(),
  totalAmount: amount.nullable().optional().describe('What the asset costs; installmentCount × amount by default'),
  installmentCount: z.number().int().min(1).max(600).nullable().optional(),
  installmentAmount: amount.nullable().optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  startMonth: z.number().int().min(1).max(12).nullable().optional().describe('Month of installment 1'),
  startYear: z.number().int().min(2000).max(2100).nullable().optional(),
  cancellationAmount: z.number().nonnegative().nullable().optional().describe('What cancelling it costs today'),
  cancellationDate: date.nullable().optional().describe('The day that amount was quoted'),
  personId: z.string().min(1).optional().describe('The owner; you by default'),
  categoryId: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe('Category of its installments (required to create them)'),
  notes: z.string().trim().max(1000).nullable().optional(),
}

export const createCommitmentSchema = z.object({
  ...commitmentFields,
  kind: z.enum(CommitmentKind),
  createInstallments: z
    .boolean()
    .optional()
    .describe('Create every installment as a fixed cost (true by default when the plan is complete)'),
})

export const updateCommitmentSchema = z
  .object({ ...commitmentFields, status: z.enum(CommitmentStatus) })
  .partial()
  .refine((value) => Object.keys(value).length > 0)

export const contributionSchema = z.object({
  date,
  amount,
  currency: z.enum(Currency).optional(),
  quantity: z.number().positive().nullable().optional().describe('0.0042'),
  unit: z.string().trim().max(20).nullable().optional().describe('BTC · acciones'),
  notes: z.string().trim().max(500).nullable().optional(),
})

export const updateContributionSchema = contributionSchema.partial().refine((value) => Object.keys(value).length > 0)

// ==================== Responses (Swagger / kogane-app types) ====================

export const commitmentProgressSchema = z.object({
  installmentCount: z.number().int(),
  createdCount: z.number().int().describe('Installments that exist as fixed costs'),
  paidCount: z.number().int(),
  remainingCount: z.number().int(),
  currentInstallment: z.number().int().describe('The one of this month; 0 before the first'),
  paidAmount: z.number(),
  pendingAmount: z.number(),
  lateCount: z.number().int(),
  nextDueDate: z.string().nullable(),
})

const commitmentBase = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(CommitmentKind),
  subtype: z.enum(CommitmentSubtype),
  entity: z.string().nullable(),
  currency: z.string(),
  totalAmount: z.number().nullable(),
  installmentCount: z.number().int().nullable(),
  installmentAmount: z.number().nullable(),
  dueDay: z.number().int().nullable(),
  startMonth: z.number().int().nullable(),
  startYear: z.number().int().nullable(),
  cancellationAmount: z.number().nullable(),
  cancellationDate: dateTimeSchema.nullable(),
  status: z.enum(CommitmentStatus).describe('active turns paid on its own when every installment is paid'),
  personId: z.string(),
  categoryId: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
})

export const commitmentResponseSchema = commitmentBase.extend({
  progress: commitmentProgressSchema.nullable().describe('Null without an installments plan'),
  contributionCount: z.number().int(),
  contributedAmount: z.number().describe('What was put in, from its contributions'),
  attachmentCount: z.number().int(),
})

export const installmentResponseSchema = z.object({
  id: z.string(),
  installment: z.string().nullable(),
  paymentMonth: z.number().int(),
  paymentYear: z.number().int(),
  dueDate: dateTimeSchema.nullable(),
  paymentDate: dateTimeSchema.nullable(),
  amount: z.number(),
  paymentStatus: z.enum(PaymentStatus),
  attachmentCount: z.number().int(),
})

export const contributionResponseSchema = z.object({
  id: z.string(),
  commitmentId: z.string(),
  date: dateTimeSchema,
  amount: z.number(),
  currency: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  notes: z.string().nullable(),
  attachmentCount: z.number().int(),
})

export const commitmentDetailResponseSchema = commitmentResponseSchema.extend({
  installments: z.array(installmentResponseSchema),
  contributions: z.array(contributionResponseSchema),
})

export const generatedInstallmentsResponseSchema = z.object({
  created: z.number().int().describe('Installments that were missing'),
})
