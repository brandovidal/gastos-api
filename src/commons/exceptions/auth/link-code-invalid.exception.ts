import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class LinkCodeInvalidException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.GONE, 'LINK_CODE_INVALID', 'The code to link Telegram is not valid or has expired', details)
  }
}
