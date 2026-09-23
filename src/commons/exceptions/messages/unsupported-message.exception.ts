import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class UnsupportedMessageException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.BAD_REQUEST, 'UNSUPPORTED_MESSAGE', 'Send text, an image or a voice note', details)
  }
}
