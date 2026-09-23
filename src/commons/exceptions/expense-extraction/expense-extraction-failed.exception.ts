import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class ExpenseExtractionFailedException extends AppException {
  constructor(details?: any) {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      'EXPENSE_EXTRACTION_FAILED',
      'No AI provider could extract the expense',
      details,
    )
  }
}
