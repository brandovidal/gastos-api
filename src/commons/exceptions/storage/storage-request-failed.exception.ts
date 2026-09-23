import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class StorageRequestFailedException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.BAD_GATEWAY, 'STORAGE_REQUEST_FAILED', 'Object storage request failed', details)
  }
}
