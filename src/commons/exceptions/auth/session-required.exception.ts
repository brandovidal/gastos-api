import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class SessionRequiredException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.UNAUTHORIZED, 'SESSION_REQUIRED', 'Sign in to continue', details)
  }
}
