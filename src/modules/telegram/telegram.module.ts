import { Module } from '@nestjs/common'

import { AuditModule } from '@/db/audit/audit.module'

import { TelegramProviderModule } from '@/providers/telegram/telegram.module'
import { ConversationModule } from '@/modules/conversation/conversation.module'

import { TelegramController } from './telegram.controller'
import { TelegramService } from './telegram.service'

@Module({
  imports: [TelegramProviderModule, ConversationModule, AuditModule],
  controllers: [TelegramController],
  providers: [TelegramService],
})
export class TelegramModule {}
