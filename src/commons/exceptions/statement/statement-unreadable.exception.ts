import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

// Neither a template nor the AI could read movements, or the card could not be told
export class StatementUnreadableException extends AppException {
  constructor(details?: { reason: string }) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, 'STATEMENT_UNREADABLE', 'The statement could not be read', details)
  }
}
