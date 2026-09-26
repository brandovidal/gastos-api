import { createZodDto } from 'nestjs-zod'

import {
  historyEntityParamSchema,
  historyQuerySchema,
  historyTimelineQuerySchema,
} from '../../validations/history.validation'

export class HistoryQueryDto extends createZodDto(historyQuerySchema) {}
export class HistoryTimelineQueryDto extends createZodDto(historyTimelineQuerySchema) {}
export class HistoryEntityParamDto extends createZodDto(historyEntityParamSchema) {}
