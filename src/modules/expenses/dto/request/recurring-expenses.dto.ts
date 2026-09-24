import { createZodDto } from 'nestjs-zod'

import { generateRecurringSchema } from '../../validations/recurring-expenses.validation'

export class GenerateRecurringDto extends createZodDto(generateRecurringSchema) {}
