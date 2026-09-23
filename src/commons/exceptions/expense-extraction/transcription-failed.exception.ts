import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class TranscriptionFailedException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.BAD_GATEWAY, 'TRANSCRIPTION_FAILED', 'The voice note could not be transcribed', details)
  }
}
