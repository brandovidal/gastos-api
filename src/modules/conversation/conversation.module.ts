import { Module } from '@nestjs/common'

import { ExpenseDraftDBModule } from '@/db/models/expense-draft/expenseDraftDB.module'
import { ExpenseDBModule } from '@/db/models/expense/expenseDB.module'
import { PaymentMethodDBModule } from '@/db/models/payment-method/paymentMethodDB.module'
import { ExpenseExtractionModule } from '@/modules/expense-extraction/expense-extraction.module'

import { ConversationService } from './conversation.service'
import { ExpenseSaverService } from './expense-saver.service'
import { MediaDownloaderRegistry } from './media-downloader.registry'

@Module({
  imports: [ExpenseDraftDBModule, ExpenseDBModule, PaymentMethodDBModule, ExpenseExtractionModule],
  providers: [ConversationService, ExpenseSaverService, MediaDownloaderRegistry],
  exports: [ConversationService, ExpenseSaverService, MediaDownloaderRegistry],
})
export class ConversationModule {}
