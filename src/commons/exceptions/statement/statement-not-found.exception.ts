import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class StatementNotFoundException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.NOT_FOUND, 'STATEMENT_NOT_FOUND', 'Statement not found', details)
  }
}
