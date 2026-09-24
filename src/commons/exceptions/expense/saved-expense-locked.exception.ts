import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

// /editar (D76): a saved expense whose debts already have payments cannot be replaced
export class SavedExpenseLockedException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.CONFLICT, 'SAVED_EXPENSE_LOCKED', 'The expense has debts with payments', details)
  }
}
