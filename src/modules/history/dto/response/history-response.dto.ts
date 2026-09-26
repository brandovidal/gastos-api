import { responseDto } from '@/commons/helpers/api-response.helper'

import { historyPageSchema } from '../../validations/history.validation'

export class HistoryPageResponseDto extends responseDto(historyPageSchema) {}
