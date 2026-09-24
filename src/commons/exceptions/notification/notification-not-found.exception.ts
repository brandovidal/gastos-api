import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class NotificationNotFoundException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.NOT_FOUND, 'NOTIFICATION_NOT_FOUND', 'Notification not found', details)
  }
}
