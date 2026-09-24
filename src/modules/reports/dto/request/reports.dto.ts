import { createZodDto } from 'nestjs-zod'

import { debtReportQuerySchema } from '../../validations/reports.validation'

export class DebtReportQueryDto extends createZodDto(debtReportQuerySchema) {}
