import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { EXPENSE_SCHEMAS, expenseListQuerySchema } from '../../validations/expenses.validation'

export class ExpenseListQueryDto extends createZodDto(expenseListQuerySchema) {}

// Swagger only: the body depends on the resource of the path and is validated in ExpensesService. The schema is the
// real union (kogane-app gets it in its types); the cast only lets TypeScript extend it.
const bodySchema = z.union(Object.values(EXPENSE_SCHEMAS)) as unknown as z.ZodObject
const patchSchema = z.union(Object.values(EXPENSE_SCHEMAS).map((schema) => schema.partial())) as unknown as z.ZodObject

export class ExpenseBodyDto extends createZodDto(bodySchema) {}
export class ExpensePatchDto extends createZodDto(patchSchema) {}
