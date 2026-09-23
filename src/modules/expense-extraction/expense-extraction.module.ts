import { Module } from '@nestjs/common'

import { AiModule } from '@/providers/ai/ai.module'
import { AiRequestLogDBModule } from '@/db/models/ai-request-log/aiRequestLogDB.module'
import { PersonDBModule } from '@/db/models/person/personDB.module'
import { PaymentMethodDBModule } from '@/db/models/payment-method/paymentMethodDB.module'
import { CreditCardDBModule } from '@/db/models/credit-card/creditCardDB.module'
import { CategoryDBModule } from '@/db/models/category/categoryDB.module'

import { ExpenseExtractionService } from './expense-extraction.service'

@Module({
  imports: [
    AiModule,
    AiRequestLogDBModule,
    PersonDBModule,
    PaymentMethodDBModule,
    CreditCardDBModule,
    CategoryDBModule,
  ],
  providers: [ExpenseExtractionService],
  exports: [ExpenseExtractionService],
})
export class ExpenseExtractionModule {}
