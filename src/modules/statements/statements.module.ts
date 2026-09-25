import { Module } from '@nestjs/common'

import { CardHolderDBModule } from '@/db/models/card-holder/cardHolderDB.module'
import { PaymentMethodDBModule } from '@/db/models/payment-method/paymentMethodDB.module'
import { PersonDBModule } from '@/db/models/person/personDB.module'
import { StatementDBModule } from '@/db/models/statement/statementDB.module'
import { ExpenseExtractionModule } from '@/modules/expense-extraction/expense-extraction.module'
import { NotificationsModule } from '@/modules/notifications/notifications.module'
import { StoredFilesModule } from '@/modules/stored-files/stored-files.module'

import { StatementsController } from './statements.controller'
import { StatementsService } from './statements.service'

@Module({
  imports: [
    CardHolderDBModule,
    StatementDBModule,
    PaymentMethodDBModule,
    PersonDBModule,
    ExpenseExtractionModule,
    StoredFilesModule,
    NotificationsModule,
  ],
  controllers: [StatementsController],
  providers: [StatementsService],
})
export class StatementsModule {}
