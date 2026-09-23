import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class DuplicateExpenseFileException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.CONFLICT, 'DUPLICATE_EXPENSE_FILE', 'Expense file already exists for this message', details)
  }
}
