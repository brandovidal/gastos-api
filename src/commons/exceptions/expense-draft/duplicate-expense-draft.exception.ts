import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class DuplicateExpenseDraftException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.CONFLICT, 'DUPLICATE_EXPENSE_DRAFT', 'Expense draft already exists for this message', details)
  }
}
