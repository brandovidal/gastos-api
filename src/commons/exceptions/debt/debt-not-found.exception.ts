import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class DebtNotFoundException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.NOT_FOUND, 'DEBT_NOT_FOUND', 'Debt not found', details)
  }
}
