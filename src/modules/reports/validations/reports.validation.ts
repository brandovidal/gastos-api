import { z } from 'zod'

import { ReportFormat } from '@/commons/constants/report.constant'

export const debtReportQuerySchema = z.object({
  format: z.enum(ReportFormat),
  personId: z.string().min(1).optional().describe('Only that person; without it, everyone'),
})
