import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class ForbiddenRoleException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.FORBIDDEN, 'FORBIDDEN_ROLE', 'You are not allowed to do this', details)
  }
}
