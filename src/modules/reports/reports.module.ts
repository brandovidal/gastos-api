import { Module } from '@nestjs/common'

import { DebtsModule } from '@/modules/debts/debts.module'

import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'

@Module({
  imports: [DebtsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
