import { z } from 'zod'

const month = z.coerce.number().int().min(1).max(12)
const year = z.coerce.number().int().min(2020).max(2100)

export const summaryQuerySchema = z.object({ month, year })

export const monthlyBudgetSchema = z.object({
  month,
  year,
  salary: z.number().min(0),
  limitPercent: z.number().min(0).max(100).optional(),
})
