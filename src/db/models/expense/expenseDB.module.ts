import { Module } from '@nestjs/common'

import { ExpenseDBRepository } from './expenseDB.repository'

@Module({
  providers: [ExpenseDBRepository],
  exports: [ExpenseDBRepository],
})
export class ExpenseDBModule {}
