import { Module } from '@nestjs/common'

import { ExpenseDraftDBModule } from '@/db/models/expense-draft/expenseDraftDB.module'
import { ConversationModule } from '@/modules/conversation/conversation.module'
import { ExpenseExtractionModule } from '@/modules/expense-extraction/expense-extraction.module'
import { StorageProviderModule } from '@/providers/storage/storage.module'

import { DraftsController } from './drafts.controller'
import { DraftsService } from './drafts.service'

@Module({
  imports: [ExpenseDraftDBModule, ConversationModule, ExpenseExtractionModule, StorageProviderModule],
  controllers: [DraftsController],
  providers: [DraftsService],
})
export class DraftsModule {}
