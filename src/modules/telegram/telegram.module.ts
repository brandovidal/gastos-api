import { Module } from '@nestjs/common'

import { TelegramProviderModule } from '@/providers/telegram/telegram.module'
import { ConversationModule } from '@/modules/conversation/conversation.module'

import { TelegramController } from './telegram.controller'
import { TelegramService } from './telegram.service'

@Module({
  imports: [TelegramProviderModule, ConversationModule],
  controllers: [TelegramController],
  providers: [TelegramService],
})
export class TelegramModule {}
