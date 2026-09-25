import { responseDto } from '@/commons/helpers/api-response.helper'

import { moveSeriesResponseSchema } from '../../validations/expense-moves.validation'

export class MoveSeriesResponseDto extends responseDto(moveSeriesResponseSchema) {}
