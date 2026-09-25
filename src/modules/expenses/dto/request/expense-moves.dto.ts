import { createZodDto } from 'nestjs-zod'

import { moveSeriesSchema } from '../../validations/expense-moves.validation'

export class MoveSeriesDto extends createZodDto(moveSeriesSchema) {}
