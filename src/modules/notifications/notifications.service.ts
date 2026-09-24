import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { Notification } from '@/generated/prisma/client'
import { APP_TIME_ZONE } from '@/commons/constants/app.constant'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationKind,
  RECENT_NOTIFICATIONS,
  UPCOMING_DAYS,
} from '@/commons/constants/notification.constant'
import { DateHelper } from '@/commons/helpers/date.helper'
import { CreateNotificationDbDto } from '@/db/models/notification/notificationDB.dto'
import { NotificationDBRepository } from '@/db/models/notification/notificationDB.repository'
import { TelegramClient } from '@/providers/telegram/telegram.client'
import { CalendarEvent, CalendarService } from '@/modules/calendar/calendar.service'
import { toReplyMarkup } from '@/modules/telegram/telegram.mapper'
import { TelegramConfig } from '@/settings/settings.model'

import { NotificationCache } from './notification-cache.service'
import { NotificationQueue } from './notification-queue.service'
import { notificationReply } from './notification.messages'

export type NotificationSettings = Record<NotificationKind, { telegram: boolean; web: boolean }>

const dayMs = (isoDay: string) => Date.parse(`${isoDay}T00:00:00Z`)

// Notifications (P20, D86): every reminder is saved once (dedupeKey) and then goes to the web bell and/or Telegram,
// as set per kind. Telegram goes through the BullMQ delivery queue (retries); without Redis it is sent right away.
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)

  constructor(
    private readonly notificationDBRepository: NotificationDBRepository,
    private readonly notificationCache: NotificationCache,
    private readonly notificationQueue: NotificationQueue,
    private readonly calendarService: CalendarService,
    private readonly telegramClient: TelegramClient,
    private readonly configService: ConfigService,
  ) {}

  // null when that kind is off in both channels or the notice already exists
  async notify(input: CreateNotificationDbDto): Promise<Notification | null> {
    const settings = (await this.settings())[input.kind as NotificationKind]
    if (!settings.telegram && !settings.web) return null

    // Off in the web: kept as history, already read, so the bell does not count it
    const created = await this.notificationDBRepository.createUnique({
      ...input,
      readAt: settings.web ? null : new Date(),
    })
    if (!created) return null

    if (settings.web) await this.notificationCache.pushRecent(created)
    if (settings.telegram) {
      const queued = await this.notificationQueue.deliver(created.id).catch((error: Error) => {
        this.logger.warn(`[notify] not queued, sending now: ${error.message}`)
        return false
      })
      if (!queued)
        await this.deliver(created.id).catch((error: Error) => this.logger.error(`[notify] ${error.message}`))
    }
    return created
  }

  // Sends one notification to the Telegram chats (the allowlist until P23). Throws so BullMQ retries it
  async deliver(notificationId: string): Promise<void> {
    const notification = await this.notificationDBRepository.findById(notificationId)
    if (notification.telegramSentAt) return

    const chatIds = this.configService.get<TelegramConfig>('telegram')?.allowedChatIds ?? []
    if (!chatIds.length || !this.configService.get<TelegramConfig>('telegram')?.botToken) {
      this.logger.warn(`[deliver] no Telegram chat to send ${notificationId} to`)
      return
    }

    const { text, buttons } = notificationReply(notification)
    let first: { chatId: string; messageId: string | null } | null = null
    for (const chatId of chatIds) {
      const sent = (await this.telegramClient.sendMessage(chatId, text, toReplyMarkup(buttons))) as
        { message_id?: number } | undefined
      first ??= { chatId, messageId: sent?.message_id ? String(sent.message_id) : null }
    }
    await this.notificationDBRepository.markSent(notificationId, first!.chatId, first!.messageId)
  }

  // ==================== Web bell and history ====================

  async recent(limit: number): Promise<Notification[]> {
    const cached = await this.notificationCache.getRecent(limit)
    if (cached) return cached
    const [{ items }, unread] = await Promise.all([
      this.notificationDBRepository.findMany({ limit: RECENT_NOTIFICATIONS, offset: 0 }),
      this.notificationDBRepository.countUnread(),
    ])
    await this.notificationCache.setRecent(items, unread)
    return items.slice(0, limit)
  }

  async unreadCount(): Promise<number> {
    const cached = await this.notificationCache.getUnread()
    if (cached != null) return cached
    return this.notificationDBRepository.countUnread()
  }

  history(query: { kind?: NotificationKind; unread?: boolean; limit: number; offset: number }) {
    return this.notificationDBRepository.findMany(query)
  }

  findById(id: string) {
    return this.notificationDBRepository.findById(id)
  }

  async markRead(id: string): Promise<void> {
    if (await this.notificationDBRepository.markRead(id)) await this.notificationCache.invalidateRecent()
  }

  async markAllRead(): Promise<number> {
    const count = await this.notificationDBRepository.markAllRead()
    if (count) await this.notificationCache.invalidateRecent()
    return count
  }

  // ==================== Settings per kind and channel ====================

  async settings(): Promise<NotificationSettings> {
    const rows = await this.notificationDBRepository.findSettings()
    const settings = structuredClone(DEFAULT_NOTIFICATION_SETTINGS)
    for (const row of rows) {
      if (row.kind in settings) settings[row.kind as NotificationKind] = { telegram: row.telegram, web: row.web }
    }
    return settings
  }

  async updateSettings(changes: Partial<Record<NotificationKind, { telegram?: boolean; web?: boolean }>>) {
    const current = await this.settings()
    for (const [kind, change] of Object.entries(changes) as [
      NotificationKind,
      { telegram?: boolean; web?: boolean },
    ][]) {
      const next = { ...current[kind], ...change }
      await this.notificationDBRepository.upsertSetting(kind, next.telegram, next.web)
    }
    return this.settings()
  }

  // ==================== Upcoming reminders (Redis ntf:upcoming) ====================

  // The next days from Redis; rebuilt from the calendar when the list is missing (or Redis is off)
  async upcoming(days: number): Promise<CalendarEvent[]> {
    const today = DateHelper.todayIn(APP_TIME_ZONE)
    const to = DateHelper.addDays(today, days)
    if (days <= UPCOMING_DAYS) {
      const cached = await this.notificationCache.getUpcoming(dayMs(today), dayMs(to))
      if (cached) return cached
    }
    const events = await this.refreshUpcoming()
    return events.filter((event) => event.date >= today && event.date <= to)
  }

  async refreshUpcoming(): Promise<CalendarEvent[]> {
    const events = await this.calendarService.upcoming(UPCOMING_DAYS)
    await this.notificationCache.setUpcoming(events)
    return events
  }
}
