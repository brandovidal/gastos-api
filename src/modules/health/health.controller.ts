import { Controller, Get } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { ResponseMessage } from '@/commons/decorators/response-message.decorator'
import { WEBHOOK_RECENT_ERROR_MS, WebhookStatus } from '@/commons/constants/telegram.constant'
import { PrismaService } from '@/db/prisma/prisma.service'
import { TelegramClient } from '@/providers/telegram/telegram.client'
import { TelegramConfig } from '@/settings/settings.model'

import { HealthResponseDto } from './dto/response/health-response.dto'
import { TelegramHealth } from './validations/health.validation'

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly telegramClient: TelegramClient,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Database and Telegram webhook status (always 200 while the process is up)' })
  @ApiOkResponse({ type: HealthResponseDto })
  @ResponseMessage('HEALTH_SUCCESS', 'Service is healthy')
  async getHealth() {
    const [database, telegram] = await Promise.all([this.prismaService.isHealthy(), this.getTelegramHealth()])

    return {
      status: 'OK',
      database: database ? 'OK' : 'DOWN',
      telegram,
      timestamp: new Date().toISOString(),
    }
  }

  // getWebhookInfo: whether Telegram can reach the webhook and how many updates it still has to deliver
  private async getTelegramHealth(): Promise<TelegramHealth> {
    const empty = { pendingUpdates: null, lastError: null, lastErrorAt: null }

    if (!this.configService.get<TelegramConfig>('telegram')?.botToken) {
      return { webhook: WebhookStatus.NOT_CONFIGURED, ...empty }
    }

    try {
      const info = await this.telegramClient.getWebhookInfo()
      const lastErrorAt = info.last_error_date ? new Date(info.last_error_date * 1000) : null
      const recentError = lastErrorAt !== null && Date.now() - lastErrorAt.getTime() < WEBHOOK_RECENT_ERROR_MS

      return {
        webhook: !info.url ? WebhookStatus.NOT_SET : recentError ? WebhookStatus.ERROR : WebhookStatus.OK,
        pendingUpdates: info.pending_update_count,
        lastError: info.last_error_message ?? null,
        lastErrorAt: lastErrorAt?.toISOString() ?? null,
      }
    } catch {
      return { webhook: WebhookStatus.UNAVAILABLE, ...empty }
    }
  }
}
