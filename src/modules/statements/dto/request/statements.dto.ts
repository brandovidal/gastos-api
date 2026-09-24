import { createZodDto } from 'nestjs-zod'

import { createNewRowsSchema, rowResultSchema, uploadStatementSchema } from '../../validations/statements.validation'

export class UploadStatementDto extends createZodDto(uploadStatementSchema) {}
export class CreateNewRowsDto extends createZodDto(createNewRowsSchema) {}
export class RowResultDto extends createZodDto(rowResultSchema) {}
