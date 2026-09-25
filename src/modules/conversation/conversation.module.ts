import { Module } from '@nestjs/common'

import { BudgetSettingDBModule } from '@/db/models/budget-setting/budgetSettingDB.module'
import { ExpenseDraftDBModule } from '@/db/models/expense-draft/expenseDraftDB.module'
import { ExpenseDBModule } from '@/db/models/expense/expenseDB.module'
import { PaymentMethodDBModule } from '@/db/models/payment-method/paymentMethodDB.module'
import { ExpenseExtractionModule } from '@/modules/expense-extraction/expense-extraction.module'
import { StoredFilesModule } from '@/modules/stored-files/stored-files.module'
import { DebtsModule } from '@/modules/debts/debts.module'
import { RecognitionModule } from '@/modules/recognition/recognition.module'
import { BudgetModule } from '@/modules/budget/budget.module'
import { ReportsModule } from '@/modules/reports/reports.module'
import { NotificationsModule } from '@/modules/notifications/notifications.module'

import { ConversationService } from './conversation.service'
import { ExpenseSaverService } from './expense-saver.service'
import { MediaDownloaderRegistry } from './media-downloader.registry'

@Module({
  imports: [
    BudgetSettingDBModule,
    ExpenseDraftDBModule,
    ExpenseDBModule,
    PaymentMethodDBModule,
    ExpenseExtractionModule,
    StoredFilesModule,
    DebtsModule,
    RecognitionModule,
    BudgetModule,
    ReportsModule,
    NotificationsModule,
  ],
  providers: [ConversationService, ExpenseSaverService, MediaDownloaderRegistry],
  exports: [ConversationService, ExpenseSaverService, MediaDownloaderRegistry],
})
export class ConversationModule {}
