import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class ExpenseNotFoundException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.NOT_FOUND, 'EXPENSE_NOT_FOUND', 'Expense not found', details)
  }
}
