import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class ExpenseNotSaveableException extends AppException {
  constructor(details?: any) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'EXPENSE_NOT_SAVEABLE',
      'Expense file is missing fields or has no destination',
      details,
    )
  }
}
