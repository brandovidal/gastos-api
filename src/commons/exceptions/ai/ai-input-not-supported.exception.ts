import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class AiInputNotSupportedException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.BAD_REQUEST, 'AI_INPUT_NOT_SUPPORTED', 'AI provider does not support this input', details)
  }
}
