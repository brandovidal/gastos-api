import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

// "Pasar a…" (D106): a row of the series has an /editar copy open, or some rows need a category to become fixed costs
export class ExpenseMoveBlockedException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.CONFLICT, 'EXPENSE_MOVE_BLOCKED', 'The series cannot be moved yet', details)
  }
}
