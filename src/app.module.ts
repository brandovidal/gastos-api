import { Module } from '@nestjs/common'

import { SettingsModule } from './settings/settings.module'
import { LoggerModule } from './providers/logger/logger.module'
import { PrismaModule } from './db/prisma/prisma.module'
import { HealthModule } from '@/modules/health/health.module'
import { TelegramModule } from '@/modules/telegram/telegram.module'

@Module({
  imports: [SettingsModule, LoggerModule, PrismaModule, HealthModule, TelegramModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
