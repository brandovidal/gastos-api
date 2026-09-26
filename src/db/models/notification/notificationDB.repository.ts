import { Injectable } from '@nestjs/common'

import { Notification, NotificationSetting } from '@/generated/prisma/client'
import { PrismaService } from '@/db/prisma/prisma.service'
import { requireUserId } from '@/db/tenant/tenant-context'
import { PrismaErrorCode } from '@/commons/constants/database.constant'
import { isPrismaError } from '@/commons/helpers/prisma-error.helper'
import { NotificationNotFoundException } from '@/commons/exceptions/notification/notification-not-found.exception'

import { CreateNotificationDbDto, NotificationFilterDbDto } from './notificationDB.dto'

// Notifications (P20, D86): the history of every reminder and alert, and which kinds go to each channel
@Injectable()
export class NotificationDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  // null when a notification with that dedupeKey already exists: the same notice is never created twice
  async createUnique(data: CreateNotificationDbDto): Promise<Notification | null> {
    try {
      return await this.prisma.notification.create({ data })
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.UNIQUE_CONSTRAINT)) return null
      throw error
    }
  }

  async findById(id: string): Promise<Notification> {
    const notification = await this.prisma.notification.findUnique({ where: { id } })
    if (!notification) throw new NotificationNotFoundException({ id })
    return notification
  }

  async findMany({ kind, unread, limit, offset }: NotificationFilterDbDto) {
    const where = { ...(kind ? { kind } : {}), ...(unread ? { readAt: null } : {}) }
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      this.prisma.notification.count({ where }),
    ])
    return { items, total }
  }

  countUnread(): Promise<number> {
    return this.prisma.notification.count({ where: { readAt: null } })
  }

  // Returns false when it was already read
  async markRead(id: string, readAt: Date = new Date()): Promise<boolean> {
    try {
      const { count } = await this.prisma.notification.updateMany({ where: { id, readAt: null }, data: { readAt } })
      if (count === 0) await this.findById(id)
      return count > 0
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RECORD_NOT_FOUND)) throw new NotificationNotFoundException({ id })
      throw error
    }
  }

  // Back to unread (the bell counts it again). Returns false when it was already unread
  async markUnread(id: string): Promise<boolean> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, readAt: { not: null } },
      data: { readAt: null },
    })
    if (count === 0) await this.findById(id)
    return count > 0
  }

  async markAllRead(readAt: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({ where: { readAt: null }, data: { readAt } })
    return count
  }

  markSent(id: string, telegramChatId: string, telegramMessageId: string | null): Promise<Notification> {
    return this.prisma.notification.update({
      where: { id },
      data: { telegramChatId, telegramMessageId, telegramSentAt: new Date() },
    })
  }

  findSettings(): Promise<NotificationSetting[]> {
    return this.prisma.notificationSetting.findMany()
  }

  upsertSetting(kind: string, telegram: boolean, web: boolean): Promise<NotificationSetting> {
    return this.prisma.notificationSetting.upsert({
      where: { userId_kind: { userId: requireUserId(), kind } },
      create: { userId: requireUserId(), kind, telegram, web },
      update: { telegram, web },
    })
  }
}
