import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

// The PDF is protected: no document number saved, or it did not open it (D94)
export class StatementPasswordException extends AppException {
  constructor(details?: { reason: 'missing' | 'incorrect' }) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, 'STATEMENT_PASSWORD', 'The statement PDF needs another password', details)
  }
}
