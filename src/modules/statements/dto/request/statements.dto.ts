import { createZodDto } from 'nestjs-zod'

import {
  assignRowsSchema,
  createNewRowsSchema,
  updateRowSchema,
  updateStatementSchema,
  uploadStatementSchema,
} from '../../validations/statements.validation'

export class UploadStatementDto extends createZodDto(uploadStatementSchema) {}
export class CreateNewRowsDto extends createZodDto(createNewRowsSchema) {}
export class UpdateRowDto extends createZodDto(updateRowSchema) {}
export class UpdateStatementDto extends createZodDto(updateStatementSchema) {}
export class AssignRowsDto extends createZodDto(assignRowsSchema) {}
