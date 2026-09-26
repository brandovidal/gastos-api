import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class InviteInvalidException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.GONE, 'INVITE_INVALID', 'The invitation is not valid or has expired', details)
  }
}
