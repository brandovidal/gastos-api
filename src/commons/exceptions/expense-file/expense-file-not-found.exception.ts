import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class ExpenseFileNotFoundException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.NOT_FOUND, 'EXPENSE_FILE_NOT_FOUND', 'Expense file not found', details)
  }
}
