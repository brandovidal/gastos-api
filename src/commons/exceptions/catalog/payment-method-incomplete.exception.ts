import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

// A credit card without its code or billing days, or a debit card without its bank (D97)
export class PaymentMethodIncompleteException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.BAD_REQUEST, 'PAYMENT_METHOD_INCOMPLETE', 'The card is missing required fields', details)
  }
}
