import { createZodDto } from 'nestjs-zod'

import {
  cardCheckQuerySchema,
  createDebtSchema,
  debtBulkSchema,
  debtListQuerySchema,
  debtSummaryQuerySchema,
  debtPaymentSchema,
  updateDebtSchema,
} from '../../validations/debts.validation'

export class DebtListQueryDto extends createZodDto(debtListQuerySchema) {}
export class CreateDebtDto extends createZodDto(createDebtSchema) {}
export class UpdateDebtDto extends createZodDto(updateDebtSchema) {}
export class DebtPaymentDto extends createZodDto(debtPaymentSchema) {}
export class DebtSummaryQueryDto extends createZodDto(debtSummaryQuerySchema) {}
export class DebtBulkDto extends createZodDto(debtBulkSchema) {}
export class CardCheckQueryDto extends createZodDto(cardCheckQuerySchema) {}
