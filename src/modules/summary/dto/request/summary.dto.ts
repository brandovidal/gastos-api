import { createZodDto } from 'nestjs-zod'

import { historyQuerySchema, monthlyBudgetSchema, summaryQuerySchema } from '../../validations/summary.validation'

export class SummaryQueryDto extends createZodDto(summaryQuerySchema) {}
export class MonthlyBudgetDto extends createZodDto(monthlyBudgetSchema) {}
export class HistoryQueryDto extends createZodDto(historyQuerySchema) {}
