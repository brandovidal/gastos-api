import { Module } from '@nestjs/common'

import { TelegramProviderModule } from '@/providers/telegram/telegram.module'

import { HealthController } from './health.controller'

@Module({
  imports: [TelegramProviderModule],
  controllers: [HealthController],
})
export class HealthModule {}
