import { createZodDto } from 'nestjs-zod'

import { expenseListQuerySchema, extractExpenseSchema } from '../../validations/expenses.validation'

export class ExpenseListQueryDto extends createZodDto(expenseListQuerySchema) {}
export class ExtractExpenseDto extends createZodDto(extractExpenseSchema) {}
