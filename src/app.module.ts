import { Module } from '@nestjs/common'

import { SettingsModule } from './settings/settings.module'
import { LoggerModule } from './providers/logger/logger.module'
import { PrismaModule } from './db/prisma/prisma.module'
import { HealthModule } from '@/modules/health/health.module'

@Module({
  imports: [SettingsModule, LoggerModule, PrismaModule, HealthModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
