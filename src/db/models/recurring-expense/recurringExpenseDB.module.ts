import { Module } from '@nestjs/common'

import { RecurringExpenseDBRepository } from './recurringExpenseDB.repository'

@Module({
  providers: [RecurringExpenseDBRepository],
  exports: [RecurringExpenseDBRepository],
})
export class RecurringExpenseDBModule {}
