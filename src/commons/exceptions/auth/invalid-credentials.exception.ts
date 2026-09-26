import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class InvalidCredentialsException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Wrong email or password', details)
  }
}
