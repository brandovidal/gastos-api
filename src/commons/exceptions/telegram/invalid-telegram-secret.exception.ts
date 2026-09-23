import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class InvalidTelegramSecretException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.UNAUTHORIZED, 'INVALID_TELEGRAM_SECRET', 'Invalid Telegram webhook secret', details)
  }
}
