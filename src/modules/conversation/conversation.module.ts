import { Module } from '@nestjs/common'

import { ExpenseFileDBModule } from '@/db/models/expense-file/expenseFileDB.module'
import { ExpenseDBModule } from '@/db/models/expense/expenseDB.module'
import { CreditCardDBModule } from '@/db/models/credit-card/creditCardDB.module'
import { ExpenseExtractionModule } from '@/modules/expense-extraction/expense-extraction.module'

import { ConversationService } from './conversation.service'
import { ExpenseSaverService } from './expense-saver.service'

@Module({
  imports: [ExpenseFileDBModule, ExpenseDBModule, CreditCardDBModule, ExpenseExtractionModule],
  providers: [ConversationService, ExpenseSaverService],
  exports: [ConversationService],
})
export class ConversationModule {}
