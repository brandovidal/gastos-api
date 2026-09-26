import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class UserDisabledException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.FORBIDDEN, 'USER_DISABLED', 'This account is disabled', details)
  }
}
