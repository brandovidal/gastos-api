import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class CategoryBudgetNotFoundException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.NOT_FOUND, 'CATEGORY_BUDGET_NOT_FOUND', 'Category budget not found', details)
  }
}
