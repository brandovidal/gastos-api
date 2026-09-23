import { BeforeApplicationShutdown, Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { ChannelMessageType } from '@/commons/constants/conversation.constant'
import { ExpenseDraftChannel } from '@/commons/constants/expense-draft.constant'
import { INTERRUPTED_DRAFT_MIN_AGE_MS, SHUTDOWN_DRAIN_TIMEOUT_MS } from '@/commons/constants/telegram.constant'
import { KeyedQueue } from '@/commons/helpers/keyed-queue.helper'
import { TelegramConfig } from '@/settings/settings.model'
import { TelegramClient } from '@/providers/telegram/telegram.client'
import { ConversationService } from '@/modules/conversation/conversation.service'
import { TEXTS } from '@/modules/conversation/conversation.messages'
import { MediaDownloaderRegistry } from '@/modules/conversation/media-downloader.registry'

import { mapTelegramUpdate, MappedTelegramUpdate, toReplyMarkup } from './telegram.mapper'
import { TelegramReplyMarkup, TelegramUpdate } from '@/providers/telegram/telegram.types'

const ERROR_TEXT = '⚠️ Algo salió mal procesando tu mensaje. Intenta de nuevo en un momento.'

// Telegram photos are JPEG; voice notes are .oga; other files keep their extension in file_path
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  oga: 'audio/ogg', // voice notes (OGG/Opus)
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
}

@Injectable()
export class TelegramService implements OnModuleInit, OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(TelegramService.name)
  private readonly queue = new KeyedQueue()

  constructor(
    private readonly configService: ConfigService,
    private readonly telegramClient: TelegramClient,
    private readonly conversationService: ConversationService,
    private readonly mediaDownloaderRegistry: MediaDownloaderRegistry,
  ) {}

  // The conversation downloads images through this (also again when a failed one is resumed from /bandeja)
  onModuleInit() {
    this.mediaDownloaderRegistry.register(ExpenseDraftChannel.TELEGRAM, async (fileId) => {
      const { data, filePath } = await this.telegramClient.downloadFile(fileId)
      const extension = filePath.split('.').pop()?.toLowerCase() ?? ''
      return { mimeType: MIME_BY_EXTENSION[extension] ?? 'image/jpeg', data: data.toString('base64') }
    })
  }

  // Messages already answered with 200 whose processing a restart cut: move them to /bandeja and tell the chat.
  // Not awaited, so a slow database or Telegram never delays startup
  onApplicationBootstrap() {
    void this.recoverInterrupted()
  }

  // Let queued messages finish (AI calls included) before the process exits
  async beforeApplicationShutdown() {
    const drained = await this.queue.drain(SHUTDOWN_DRAIN_TIMEOUT_MS)
    if (!drained) this.logger.warn('[beforeApplicationShutdown] exiting with messages still in process')
  }

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
      if (message.type !== ChannelMessageType.COMMAND && message.type !== ChannelMessageType.ACTION) {
        await this.telegramClient.sendChatAction(chatId, 'typing').catch(() => undefined)
      }

      const { replies, notice } = await this.conversationService.handle(message)

      if (callbackQueryId) {
        await this.telegramClient.answerCallbackQuery(callbackQueryId, notice).catch(() => undefined)
      }

      for (const reply of replies) {
        const markup = toReplyMarkup(reply.buttons)

        if (reply.edit && sourceMessageId) {
          await this.editOrSend(chatId, sourceMessageId, reply.text, markup)
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

  // The work behind the reply is already done: if the old message cannot be edited (deleted, unchanged…),
  // send the reply as a new message instead of reporting an error
  private async editOrSend(chatId: string, messageId: number, text: string, markup?: TelegramReplyMarkup) {
    try {
      await this.telegramClient.editMessageText(chatId, messageId, text, markup)
    } catch (error) {
      this.logger.warn(`[editOrSend] could not edit, sending instead: ${(error as Error).message}`)
      await this.telegramClient.sendMessage(chatId, text, markup)
    }
  }

  private async recoverInterrupted() {
    try {
      const before = new Date(Date.now() - INTERRUPTED_DRAFT_MIN_AGE_MS)
      const affected = await this.conversationService.recoverInterrupted(ExpenseDraftChannel.TELEGRAM, before)

      for (const { chatId, count } of affected) {
        if (!this.isAllowed(chatId)) continue
        await this.telegramClient.sendMessage(chatId, TEXTS.interrupted(count)).catch(() => undefined)
      }
      if (affected.length)
        this.logger.warn(`[recoverInterrupted] moved interrupted drafts of ${affected.length} chat(s) to failed`)
    } catch (error) {
      this.logger.error(`[recoverInterrupted] ${(error as Error).message}`)
    }
  }

  private isAllowed(chatId: string): boolean {
    return this.configService.get<TelegramConfig>('telegram')?.allowedChatIds.includes(chatId) ?? false
  }
}
