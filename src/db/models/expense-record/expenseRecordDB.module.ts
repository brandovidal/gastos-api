import { Module } from '@nestjs/common'

import { ExpenseRecordDBRepository } from './expenseRecordDB.repository'

@Module({
  providers: [ExpenseRecordDBRepository],
  exports: [ExpenseRecordDBRepository],
})
export class ExpenseRecordDBModule {}
