import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class DebtPaymentExceedsBalanceException extends AppException {
  constructor(details?: any) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'DEBT_PAYMENT_EXCEEDS_BALANCE',
      'The payment is greater than the balance',
      details,
    )
  }
}
