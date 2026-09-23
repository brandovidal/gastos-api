import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class InvalidApiKeyException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.UNAUTHORIZED, 'INVALID_API_KEY', 'Invalid API key', details)
  }
}
