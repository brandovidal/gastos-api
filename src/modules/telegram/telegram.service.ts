import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { ChannelMessageType } from '@/commons/constants/conversation.constant'
import { KeyedQueue } from '@/commons/helpers/keyed-queue.helper'
import { TelegramConfig } from '@/settings/settings.model'
import { TelegramClient } from '@/providers/telegram/telegram.client'
import { ConversationService } from '@/modules/conversation/conversation.service'

import { mapTelegramUpdate, MappedTelegramUpdate, toReplyMarkup } from './telegram.mapper'
import { TelegramUpdate } from '@/providers/telegram/telegram.types'

const ERROR_TEXT = '⚠️ Algo salió mal procesando tu mensaje. Intenta de nuevo en un momento.'

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name)
  private readonly queue = new KeyedQueue()

  constructor(
    private readonly configService: ConfigService,
    private readonly telegramClient: TelegramClient,
    private readonly conversationService: ConversationService,
  ) {}

  // Called by the webhook: returns at once so Telegram gets its 200; the work runs in the chat queue
  enqueue(update: TelegramUpdate): Promise<void> | null {
    const mapped = mapTelegramUpdate(update)
    if (!mapped) return null

    if (!this.isAllowed(mapped.message.chatId)) {
      this.logger.warn(`[enqueue] ignored update ${update.update_id} from a chat outside the allowlist`)
      return null
    }

    return this.queue.run(mapped.message.chatId, () => this.process(mapped))
  }

  private async process({ message, callbackQueryId, sourceMessageId }: MappedTelegramUpdate): Promise<void> {
    const { chatId } = message

    try {
      if (message.type === ChannelMessageType.TEXT) {
        await this.telegramClient.sendChatAction(chatId, 'typing').catch(() => undefined)
      }

      const { replies, notice } = await this.conversationService.handle(message)

      if (callbackQueryId) {
        await this.telegramClient.answerCallbackQuery(callbackQueryId, notice).catch(() => undefined)
      }

      for (const reply of replies) {
        const markup = toReplyMarkup(reply.buttons)

        if (reply.edit && sourceMessageId) {
          await this.telegramClient.editMessageText(chatId, sourceMessageId, reply.text, markup)
        } else {
          await this.telegramClient.sendMessage(chatId, reply.text, markup)
        }
      }
    } catch (error) {
      this.logger.error(`[process] ${(error as Error).message}`)

      if (callbackQueryId) {
        await this.telegramClient.answerCallbackQuery(callbackQueryId).catch(() => undefined)
      }
      await this.telegramClient.sendMessage(chatId, ERROR_TEXT).catch(() => undefined)
    }
  }

  private isAllowed(chatId: string): boolean {
    return this.configService.get<TelegramConfig>('telegram')?.allowedChatIds.includes(chatId) ?? false
  }
}
