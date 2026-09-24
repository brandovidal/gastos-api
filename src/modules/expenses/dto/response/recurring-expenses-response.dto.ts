import { responseDto } from '@/commons/helpers/api-response.helper'

import { recurringGenerationResponseSchema } from '../../validations/recurring-expenses.validation'

export class RecurringGenerationResponseDto extends responseDto(recurringGenerationResponseSchema) {}
