import { Module } from '@nestjs/common'

import { ConversationModule } from '@/modules/conversation/conversation.module'
import { StorageProviderModule } from '@/providers/storage/storage.module'

import { MessagesController } from './messages.controller'
import { MessagesService } from './messages.service'

@Module({
  imports: [ConversationModule, StorageProviderModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
