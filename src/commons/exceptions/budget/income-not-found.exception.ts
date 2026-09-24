import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class IncomeNotFoundException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.NOT_FOUND, 'INCOME_NOT_FOUND', 'Income not found', details)
  }
}
