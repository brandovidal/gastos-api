import { Module } from '@nestjs/common'

import { DebtDBModule } from '@/db/models/debt/debtDB.module'

import { DebtsController } from './debts.controller'
import { DebtsService } from './debts.service'

@Module({
  imports: [DebtDBModule],
  controllers: [DebtsController],
  providers: [DebtsService],
  exports: [DebtsService],
})
export class DebtsModule {}
