import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class WeakPasswordException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, 'WEAK_PASSWORD', 'The password is too short', details)
  }
}
