import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class AiRequestFailedException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.BAD_GATEWAY, 'AI_REQUEST_FAILED', 'AI provider request failed', details)
  }
}
