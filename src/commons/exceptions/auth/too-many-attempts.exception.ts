import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class TooManyAttemptsException extends AppException {
  constructor(details?: any) {
    super(
      HttpStatus.TOO_MANY_REQUESTS,
      'TOO_MANY_ATTEMPTS',
      'Too many failed attempts: try again in a few minutes',
      details,
    )
  }
}
