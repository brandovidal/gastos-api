import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class CommitmentNotFoundException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.NOT_FOUND, 'COMMITMENT_NOT_FOUND', 'Loan or investment not found', details)
  }
}
