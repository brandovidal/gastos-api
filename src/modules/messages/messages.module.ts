import { Module } from '@nestjs/common'

import { ConversationModule } from '@/modules/conversation/conversation.module'
import { StoredFilesModule } from '@/modules/stored-files/stored-files.module'

import { MessagesController } from './messages.controller'
import { MessagesService } from './messages.service'

@Module({
  imports: [ConversationModule, StoredFilesModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
