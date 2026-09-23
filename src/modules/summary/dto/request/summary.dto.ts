import { createZodDto } from 'nestjs-zod'

import { monthlyBudgetSchema, summaryQuerySchema } from '../../validations/summary.validation'

export class SummaryQueryDto extends createZodDto(summaryQuerySchema) {}
export class MonthlyBudgetDto extends createZodDto(monthlyBudgetSchema) {}
