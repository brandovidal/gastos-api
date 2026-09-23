import { Module } from '@nestjs/common'

import { ExpenseDraftDBRepository } from './expenseDraftDB.repository'
import { ExpenseDraftDBSerializer } from './expenseDraftDB.serializer'

@Module({
  providers: [ExpenseDraftDBRepository, ExpenseDraftDBSerializer],
  exports: [ExpenseDraftDBRepository, ExpenseDraftDBSerializer],
})
export class ExpenseDraftDBModule {}
