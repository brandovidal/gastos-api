import { z } from 'zod'

import { responseDto } from '@/commons/helpers/api-response.helper'

import {
  calendarEventResponseSchema,
  committedInstallmentsResponseSchema,
  payEventResponseSchema,
} from '../../validations/calendar.validation'

export class CalendarEventsResponseDto extends responseDto(z.array(calendarEventResponseSchema)) {}
export class CommittedInstallmentsResponseDto extends responseDto(committedInstallmentsResponseSchema) {}
export class PayEventResponseDto extends responseDto(payEventResponseSchema) {}
