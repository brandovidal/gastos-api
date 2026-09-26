import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class UserNotFoundException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', 'User not found', details)
  }
}
