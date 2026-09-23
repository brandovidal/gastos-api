import { Module } from '@nestjs/common'

import { MonthlyBudgetDBRepository } from './monthlyBudgetDB.repository'

@Module({
  providers: [MonthlyBudgetDBRepository],
  exports: [MonthlyBudgetDBRepository],
})
export class MonthlyBudgetDBModule {}
