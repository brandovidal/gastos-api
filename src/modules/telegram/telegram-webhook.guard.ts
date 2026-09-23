import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { timingSafeEqual } from 'node:crypto'

import { TELEGRAM_SECRET_HEADER } from '@/commons/constants/telegram.constant'
import { InvalidTelegramSecretException } from '@/commons/exceptions/telegram/invalid-telegram-secret.exception'
import { TelegramConfig } from '@/settings/settings.model'

// Only Telegram knows the secret set with setWebhook(secret_token). The chat allowlist is checked later,
// in TelegramService, so blocked chats still get a 200 and Telegram does not retry them.
@Injectable()
export class TelegramWebhookGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const received = request.headers[TELEGRAM_SECRET_HEADER]
    const expected = this.configService.get<TelegramConfig>('telegram')?.webhookSecret

    if (!expected || typeof received !== 'string' || !this.safeEqual(received, expected)) {
      throw new InvalidTelegramSecretException()
    }

    return true
  }

  private safeEqual(received: string, expected: string): boolean {
    const a = Buffer.from(received)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  }
}
