import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class AttachmentNotFoundException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.NOT_FOUND, 'ATTACHMENT_NOT_FOUND', 'Attachment not found', details)
  }
}
