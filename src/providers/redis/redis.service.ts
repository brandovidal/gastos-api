import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

import { RedisConfig } from '@/settings/settings.model'

// Redis of the reminders (P20, D87): the BullMQ queues and the lists of the bell. Optional: without REDIS_URL
// (tests, CI) `client` is null, no job is scheduled and the lists are read from the database.
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name)
  readonly client: Redis | null
  private readonly url: string | undefined
  private readonly connections: Redis[] = []

  constructor(configService: ConfigService) {
    this.url = configService.get<RedisConfig>('redis')?.url
    this.client = this.url ? this.connect(this.url) : null
    if (!this.url) this.logger.warn('REDIS_URL is not set: reminders and scheduled jobs are off')
  }

  get isEnabled(): boolean {
    return this.client !== null
  }

  // BullMQ workers block on Redis and need their own connection without a retry limit per request
  connection(): Redis {
    if (!this.url) throw new Error('REDIS_URL is not set')
    return this.connect(this.url, true)
  }

  async isHealthy(): Promise<boolean | null> {
    if (!this.client) return null
    try {
      return (await this.client.ping()) === 'PONG'
    } catch {
      return false
    }
  }

  async onModuleDestroy() {
    await Promise.all(this.connections.map((connection) => connection.quit().catch(() => undefined)))
  }

  private connect(url: string, forWorker = false): Redis {
    // Railway's private network is IPv6 only: family 0 lets ioredis use either
    const connection = new Redis(url, { family: 0, maxRetriesPerRequest: forWorker ? null : 3 })
    connection.on('error', (error: Error) => this.logger.warn(`[redis] ${error.message}`))
    this.connections.push(connection)
    return connection
  }
}
