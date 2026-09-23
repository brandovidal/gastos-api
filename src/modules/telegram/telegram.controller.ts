import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'

import { ResponseMessage } from '@/commons/decorators/response-message.decorator'
import { TELEGRAM_SECRET_HEADER } from '@/commons/constants/telegram.constant'

import { TelegramService } from './telegram.service'
import { TelegramWebhookGuard } from './telegram-webhook.guard'
import { WebhookResponseDto } from './dto/response/webhook-response.dto'
import { TelegramUpdate } from '@/providers/telegram/telegram.types'

@ApiTags('telegram')
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  // Answers 200 right away; the update is processed in the background (Telegram retries slow webhooks)
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @UseGuards(TelegramWebhookGuard)
  @ApiOperation({
    summary: 'Telegram webhook (called by Telegram only)',
    description:
      'Registered with `pnpm telegram:setup`. Answers 200 at once and processes the update in the chat queue. ' +
      'Chats outside TELEGRAM_ALLOWED_CHAT_IDS also get 200 and are ignored.',
  })
  @ApiHeader({ name: TELEGRAM_SECRET_HEADER, required: true, description: 'TELEGRAM_WEBHOOK_SECRET' })
  @ApiBody({
    description: 'Telegram Update: https://core.telegram.org/bots/api#update (message or callback_query)',
    schema: {
      type: 'object',
      example: {
        update_id: 1,
        message: { message_id: 10, chat: { id: 555, type: 'private' }, date: 0, text: 'almuerzo 25 soles con yape' },
      },
    },
  })
  @ApiOkResponse({ type: WebhookResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or wrong secret header' })
  @ResponseMessage('TELEGRAM_UPDATE_RECEIVED', 'Update received')
  receiveUpdate(@Body() update: TelegramUpdate) {
    void this.telegramService.enqueue(update)
    return { received: true }
  }
}
