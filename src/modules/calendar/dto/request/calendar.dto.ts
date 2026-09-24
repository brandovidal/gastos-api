import { createZodDto } from 'nestjs-zod'

import { calendarQuerySchema, installmentsQuerySchema, payEventSchema } from '../../validations/calendar.validation'

export class CalendarQueryDto extends createZodDto(calendarQuerySchema) {}
export class InstallmentsQueryDto extends createZodDto(installmentsQuerySchema) {}
export class PayEventDto extends createZodDto(payEventSchema) {}
