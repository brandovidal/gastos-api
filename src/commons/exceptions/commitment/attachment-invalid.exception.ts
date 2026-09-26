import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

// The file is not an image, PDF or document, or it is bigger than the limit (D100)
export class AttachmentInvalidException extends AppException {
  constructor(details?: { reason: 'type' | 'size' | 'empty'; contentType?: string }) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, 'ATTACHMENT_INVALID', 'The file cannot be attached', details)
  }
}
