import { Module } from '@nestjs/common'

import { BudgetSettingDBRepository } from './budgetSettingDB.repository'

@Module({
  providers: [BudgetSettingDBRepository],
  exports: [BudgetSettingDBRepository],
})
export class BudgetSettingDBModule {}
