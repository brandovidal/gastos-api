import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaLibSql } from '@prisma/adapter-libsql'

import { PrismaClient } from '@/generated/prisma/client'

import { DatabaseConfig } from '@/settings/settings.model'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    const db = configService.getOrThrow<DatabaseConfig>('db')

    // Fail with a clear message (Railway logs) instead of libsql's "URL 'undefined' is not in a valid format"
    if (!db.url) throw new Error('DATABASE_URL is not set (see docs/deploy.md)')
    if (db.url.startsWith('libsql://') && !db.authToken) throw new Error('DATABASE_AUTH_TOKEN is not set for Turso')

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
