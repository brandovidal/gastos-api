import { Module } from '@nestjs/common'

import { BudgetGroupDBRepository } from './budgetGroupDB.repository'

@Module({
  providers: [BudgetGroupDBRepository],
  exports: [BudgetGroupDBRepository],
})
export class BudgetGroupDBModule {}
