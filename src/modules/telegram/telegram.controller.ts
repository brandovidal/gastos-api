import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'

import { ResponseMessage } from '@/commons/decorators/response-message.decorator'

import { TelegramService } from './telegram.service'
import { TelegramWebhookGuard } from './telegram-webhook.guard'
import { TelegramUpdate } from '@/providers/telegram/telegram.types'

@ApiExcludeController()
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  // Answers 200 right away; the update is processed in the background (Telegram retries slow webhooks)
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @UseGuards(TelegramWebhookGuard)
  @ResponseMessage('TELEGRAM_UPDATE_RECEIVED', 'Update received')
  receiveUpdate(@Body() update: TelegramUpdate) {
    void this.telegramService.enqueue(update)
    return { received: true }
  }
}
