import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaLibSql } from '@prisma/adapter-libsql'

import { PrismaClient } from '@/generated/prisma/client'

import { DatabaseConfig } from '@/settings/settings.model'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    const db = configService.getOrThrow<DatabaseConfig>('db')

    // Local SQLite (file:) and Turso (libsql://) share the same adapter
    super({ adapter: new PrismaLibSql({ url: db.url, authToken: db.authToken }) })
  }

  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`
      return true
    } catch (_error) {
      return false
    }
  }
}
