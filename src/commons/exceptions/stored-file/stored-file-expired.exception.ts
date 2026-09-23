import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class StoredFileExpiredException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.GONE, 'STORED_FILE_EXPIRED', 'The file expired and was deleted; send it again', details)
  }
}
