import { Injectable, Logger } from '@nestjs/common'

import { Notification } from '@/generated/prisma/client'
import {
  AWAITING_AMOUNT_TTL_SECONDS,
  RECENT_NOTIFICATIONS,
  REDIS_KEYS,
} from '@/commons/constants/notification.constant'
import { requireUserId } from '@/db/tenant/tenant-context'
import { RedisService } from '@/providers/redis/redis.service'
import { CalendarEvent } from '@/modules/calendar/calendar.service'

// Lists of P20 in Redis (D87), one set per user (P23): upcoming reminders, the latest notifications and the unread counter of the bell.
// Turso stays the source of truth: every read returns null when the list is missing or Redis fails, and the caller
// rebuilds it from the database. Without Redis the ✏️ Editar monto wait is kept in memory (one process).
@Injectable()
export class NotificationCache {
  private readonly logger = new Logger(NotificationCache.name)
  private readonly awaitingInMemory = new Map<string, { notificationId: string; expiresAt: number }>()

  constructor(private readonly redisService: RedisService) {}

  async getUpcoming(fromMs: number, toMs: number): Promise<CalendarEvent[] | null> {
    return this.safely('getUpcoming', async (redis) => {
      if (!(await redis.exists(REDIS_KEYS.upcoming(requireUserId())))) return null
      const members = await redis.zrangebyscore(REDIS_KEYS.upcoming(requireUserId()), fromMs, toMs)
      return members
        .map((member) => JSON.parse(member) as CalendarEvent & { sentinel?: boolean; index?: number })
        .filter((member) => !member.sentinel)
        .map(({ index: _index, ...event }) => event)
    })
  }

  async setUpcoming(events: CalendarEvent[]): Promise<void> {
    await this.safely('setUpcoming', async (redis) => {
      const multi = redis.multi().del(REDIS_KEYS.upcoming(requireUserId()))
      // An empty calendar still has the key (a sentinel far in the past), so it is not rebuilt on every read
      multi.zadd(REDIS_KEYS.upcoming(requireUserId()), 0, JSON.stringify({ sentinel: true }))
      // The index keeps two equal events (same day, name and amount) as two members of the set
      events.forEach((event, index) =>
        multi.zadd(
          REDIS_KEYS.upcoming(requireUserId()),
          Date.parse(`${event.date}T00:00:00Z`),
          JSON.stringify({ ...event, index }),
        ),
      )
      await multi.exec()
    })
  }

  async getRecent(limit: number): Promise<Notification[] | null> {
    return this.safely('getRecent', async (redis) => {
      if (!(await redis.exists(REDIS_KEYS.recent(requireUserId())))) return null
      const items = await redis.lrange(REDIS_KEYS.recent(requireUserId()), 0, limit - 1)
      return items.map((item) => this.revive(JSON.parse(item) as Notification))
    })
  }

  async setRecent(notifications: Notification[], unread: number): Promise<void> {
    await this.safely('setRecent', async (redis) => {
      const multi = redis.multi().del(REDIS_KEYS.recent(requireUserId()))
      if (notifications.length)
        multi.rpush(REDIS_KEYS.recent(requireUserId()), ...notifications.map((item) => JSON.stringify(item)))
      await multi.set(REDIS_KEYS.unread(requireUserId()), unread).exec()
    })
  }

  // A new notification for the bell: first of the list, one more unread (only when the list already exists)
  async pushRecent(notification: Notification): Promise<void> {
    await this.safely('pushRecent', async (redis) => {
      if (!(await redis.exists(REDIS_KEYS.recent(requireUserId())))) return
      const multi = redis
        .multi()
        .lpush(REDIS_KEYS.recent(requireUserId()), JSON.stringify(notification))
        .ltrim(REDIS_KEYS.recent(requireUserId()), 0, RECENT_NOTIFICATIONS - 1)
      if (!notification.readAt) multi.incr(REDIS_KEYS.unread(requireUserId()))
      await multi.exec()
    })
  }

  async getUnread(): Promise<number | null> {
    return this.safely('getUnread', async (redis) => {
      const value = await redis.get(REDIS_KEYS.unread(requireUserId()))
      return value == null ? null : Math.max(0, Number(value))
    })
  }

  // Something was read: the next read rebuilds the list and the counter from the database
  async invalidateRecent(): Promise<void> {
    await this.safely('invalidateRecent', (redis) =>
      redis.del(REDIS_KEYS.recent(requireUserId()), REDIS_KEYS.unread(requireUserId())),
    )
  }

  async setAwaitingAmount(chatId: string, notificationId: string): Promise<void> {
    const saved = await this.safely('setAwaitingAmount', (redis) =>
      redis.set(REDIS_KEYS.awaitingAmount(chatId), notificationId, 'EX', AWAITING_AMOUNT_TTL_SECONDS),
    )
    if (saved == null) {
      this.awaitingInMemory.set(chatId, { notificationId, expiresAt: Date.now() + AWAITING_AMOUNT_TTL_SECONDS * 1000 })
    }
  }

  async getAwaitingAmount(chatId: string): Promise<string | null> {
    const stored = await this.safely('getAwaitingAmount', (redis) => redis.get(REDIS_KEYS.awaitingAmount(chatId)))
    if (stored) return stored
    const inMemory = this.awaitingInMemory.get(chatId)
    if (!inMemory || inMemory.expiresAt < Date.now()) {
      this.awaitingInMemory.delete(chatId)
      return null
    }
    return inMemory.notificationId
  }

  async clearAwaitingAmount(chatId: string): Promise<void> {
    this.awaitingInMemory.delete(chatId)
    await this.safely('clearAwaitingAmount', (redis) => redis.del(REDIS_KEYS.awaitingAmount(chatId)))
  }

  // JSON turns dates into strings
  private revive(notification: Notification): Notification {
    const date = (value: Date | string | null) => (value ? new Date(value) : null)
    return {
      ...notification,
      eventDate: date(notification.eventDate),
      readAt: date(notification.readAt),
      telegramSentAt: date(notification.telegramSentAt),
      createdAt: new Date(notification.createdAt),
    }
  }

  private async safely<T>(
    operation: string,
    run: (redis: NonNullable<RedisService['client']>) => Promise<T>,
  ): Promise<T | null> {
    const redis = this.redisService.client
    if (!redis) return null
    try {
      return await run(redis)
    } catch (error) {
      this.logger.warn(`[${operation}] ${(error as Error).message}`)
      return null
    }
  }
}
