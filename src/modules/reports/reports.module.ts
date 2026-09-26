import { Module } from '@nestjs/common'

import { DebtsModule } from '@/modules/debts/debts.module'
import { PaymentMethodDBModule } from '@/db/models/payment-method/paymentMethodDB.module'

import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'

@Module({
  imports: [DebtsModule, PaymentMethodDBModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
