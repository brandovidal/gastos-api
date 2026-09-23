import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class ExpenseDraftNotFoundException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.NOT_FOUND, 'EXPENSE_DRAFT_NOT_FOUND', 'Expense draft not found', details)
  }
}
