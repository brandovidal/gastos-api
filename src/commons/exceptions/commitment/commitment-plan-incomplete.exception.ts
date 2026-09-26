import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

// Installments cannot be created: the plan (count, amount, due day, start) or the category is missing
export class CommitmentPlanIncompleteException extends AppException {
  constructor(details?: { missing: string[] }) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, 'COMMITMENT_PLAN_INCOMPLETE', 'The installments plan is incomplete', details)
  }
}
