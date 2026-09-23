import { Module } from '@nestjs/common'

import { ExpenseFileDBRepository } from './expenseFileDB.repository'
import { ExpenseFileDBSerializer } from './expenseFileDB.serializer'

@Module({
  providers: [ExpenseFileDBRepository, ExpenseFileDBSerializer],
  exports: [ExpenseFileDBRepository, ExpenseFileDBSerializer],
})
export class ExpenseFileDBModule {}
