import { Module } from '@nestjs/common'

import { IncomeDBRepository } from './incomeDB.repository'

@Module({
  providers: [IncomeDBRepository],
  exports: [IncomeDBRepository],
})
export class IncomeDBModule {}
