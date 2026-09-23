import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import configuration from '@/settings/settings.configuration'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] })],
  controllers: [],
  providers: [],
})
export class SettingsModule {}
