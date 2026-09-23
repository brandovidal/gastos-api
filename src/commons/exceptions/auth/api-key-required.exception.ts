import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class ApiKeyRequiredException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.UNAUTHORIZED, 'API_KEY_REQUIRED', 'API key is required', details)
  }
}
