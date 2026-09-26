import { z } from 'zod'

import { DebtDirection, DebtStatus, DebtTiming } from '@/commons/constants/debt.constant'
import { ReportFormat } from '@/commons/constants/report.constant'

export const debtReportQuerySchema = z.object({
  format: z.enum(ReportFormat),
  personId: z.string().min(1).optional().describe('Only that person; without it, everyone'),
  direction: z.enum(DebtDirection).optional().describe('Cobros (owed_to_me) or Deudas (i_owe); both without it'),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  until: z.stringbool().optional(),
  person: z.string().min(1).optional(),
  state: z.union([z.enum(DebtStatus), z.enum(DebtTiming), z.literal('open')]).optional(),
  card: z.string().min(1).optional(),
  origin: z.enum(['shared', 'loan']).optional(),
  q: z.string().trim().optional(),
})
