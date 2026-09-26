import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class NotInvitedException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.FORBIDDEN, 'NOT_INVITED', 'This email has no invitation', details)
  }
}
