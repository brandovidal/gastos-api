import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class ContributionNotFoundException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.NOT_FOUND, 'CONTRIBUTION_NOT_FOUND', 'Contribution not found', details)
  }
}
