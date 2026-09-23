import { createZodDto } from 'nestjs-zod'

import { draftFieldsSchema, draftListQuerySchema } from '../../validations/drafts.validation'

export class DraftFieldsDto extends createZodDto(draftFieldsSchema) {}
export class DraftListQueryDto extends createZodDto(draftListQuerySchema) {}
