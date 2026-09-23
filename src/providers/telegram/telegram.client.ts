import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import {
  TELEGRAM_API_URL,
  TELEGRAM_MAX_RETRIES,
  TELEGRAM_MAX_RETRY_AFTER_SECONDS,
  TELEGRAM_PARSE_MODE,
  TELEGRAM_REQUEST_TIMEOUT_MS,
  TELEGRAM_RETRY_DELAY_MS,
} from '@/commons/constants/telegram.constant'
import { TelegramRequestFailedException } from '@/commons/exceptions/telegram/telegram-request-failed.exception'
import { TelegramConfig } from '@/settings/settings.model'
import { TelegramReplyMarkup, TelegramWebhookInfo } from './telegram.types'

interface TelegramResponse<T> {
  ok: boolean
  result?: T
  description?: string
  parameters?: { retry_after?: number }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

  getWebhookInfo() {
    return this.call<TelegramWebhookInfo>('getWebhookInfo', {})
  }

  async call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
    const botToken = this.configService.get<TelegramConfig>('telegram')?.botToken

    if (!botToken) {
      throw new TelegramRequestFailedException({ method, reason: 'TELEGRAM_BOT_TOKEN is not set' })
    }

    for (let attempt = 0; ; attempt++) {
      let response: Response
      try {
        response = await fetch(`${TELEGRAM_API_URL}/bot${botToken}/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TELEGRAM_REQUEST_TIMEOUT_MS),
        })
      } catch (error) {
        // Network error or timeout: the request may not have reached Telegram
        if (attempt < TELEGRAM_MAX_RETRIES) {
          await sleep(TELEGRAM_RETRY_DELAY_MS)
          continue
        }
        throw new TelegramRequestFailedException({ method, reason: (error as Error).name })
      }

      const payload = (await response.json()) as TelegramResponse<T>
      if (payload.ok) return payload.result as T

      const waitMs = this.retryDelayMs(response.status, payload)
      if (waitMs !== null && attempt < TELEGRAM_MAX_RETRIES) {
        await sleep(waitMs)
        continue
      }

      // Never include the token (it is part of the URL) in errors
      throw new TelegramRequestFailedException({ method, status: response.status, reason: payload.description })
    }
  }

  // 429 waits what Telegram asks (up to a limit) and 5xx a fixed delay; anything else is not retried
  private retryDelayMs(status: number, payload: TelegramResponse<unknown>): number | null {
    if (status === 429) {
      const retryAfter = payload.parameters?.retry_after ?? 1
      return retryAfter <= TELEGRAM_MAX_RETRY_AFTER_SECONDS ? retryAfter * 1_000 : null
    }
    return status >= 500 ? TELEGRAM_RETRY_DELAY_MS : null
  }
}
