import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { TELEGRAM_API_URL, TELEGRAM_PARSE_MODE } from '@/commons/constants/telegram.constant'
import { TelegramRequestFailedException } from '@/commons/exceptions/telegram/telegram-request-failed.exception'
import { TelegramConfig } from '@/settings/settings.model'
import { TelegramReplyMarkup } from './telegram.types'

interface TelegramResponse<T> {
  ok: boolean
  result?: T
  description?: string
}

// Minimal Bot API client over fetch: the bot only needs a handful of methods
@Injectable()
export class TelegramClient {
  constructor(private readonly configService: ConfigService) {}

  sendMessage(chatId: string, text: string, replyMarkup?: TelegramReplyMarkup) {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: TELEGRAM_PARSE_MODE,
      reply_markup: replyMarkup,
    })
  }

  editMessageText(chatId: string, messageId: number, text: string, replyMarkup?: TelegramReplyMarkup) {
    return this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: TELEGRAM_PARSE_MODE,
      reply_markup: replyMarkup,
    })
  }

  answerCallbackQuery(callbackQueryId: string, text?: string) {
    return this.call('answerCallbackQuery', { callback_query_id: callbackQueryId, text })
  }

  sendChatAction(chatId: string, action: 'typing') {
    return this.call('sendChatAction', { chat_id: chatId, action })
  }

  async call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
    const botToken = this.configService.get<TelegramConfig>('telegram')?.botToken

    if (!botToken) {
      throw new TelegramRequestFailedException({ method, reason: 'TELEGRAM_BOT_TOKEN is not set' })
    }

    const response = await fetch(`${TELEGRAM_API_URL}/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = (await response.json()) as TelegramResponse<T>

    if (!payload.ok) {
      // Never include the token (it is part of the URL) in errors
      throw new TelegramRequestFailedException({ method, status: response.status, reason: payload.description })
    }

    return payload.result as T
  }
}
