import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class TelegramRequestFailedException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.BAD_GATEWAY, 'TELEGRAM_REQUEST_FAILED', 'Telegram Bot API request failed', details)
  }
}
