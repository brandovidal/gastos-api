import { createZodDto } from 'nestjs-zod'

import { createNewRowsSchema, updateRowSchema, uploadStatementSchema } from '../../validations/statements.validation'

export class UploadStatementDto extends createZodDto(uploadStatementSchema) {}
export class CreateNewRowsDto extends createZodDto(createNewRowsSchema) {}
export class UpdateRowDto extends createZodDto(updateRowSchema) {}
