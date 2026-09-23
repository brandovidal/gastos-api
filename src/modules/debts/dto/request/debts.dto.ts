import { createZodDto } from 'nestjs-zod'

import {
  createDebtSchema,
  debtListQuerySchema,
  debtPaymentSchema,
  updateDebtSchema,
} from '../../validations/debts.validation'

export class DebtListQueryDto extends createZodDto(debtListQuerySchema) {}
export class CreateDebtDto extends createZodDto(createDebtSchema) {}
export class UpdateDebtDto extends createZodDto(updateDebtSchema) {}
export class DebtPaymentDto extends createZodDto(debtPaymentSchema) {}
