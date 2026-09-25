import { createZodDto } from 'nestjs-zod'

import { importRowsQuerySchema } from '../../validations/imports.validation'

export class ImportRowsQueryDto extends createZodDto(importRowsQuerySchema) {}
