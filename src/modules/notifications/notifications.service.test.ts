import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { vi } from 'vitest'

import { Notification } from '@/generated/prisma/client'
import { NotificationKind, NotificationRefType } from '@/commons/constants/notification.constant'
import { NotificationDBRepository } from '@/db/models/notification/notificationDB.repository'
import { TelegramClient } from '@/providers/telegram/telegram.client'
import { CalendarService } from '@/modules/calendar/calendar.service'

import { NotificationCache } from './notification-cache.service'
import { NotificationQueue } from './notification-queue.service'
import { NotificationsService } from './notifications.service'

const mockDB = {
  createUnique: vi.fn(),
  findById: vi.fn(),
  findMany: vi.fn(),
  countUnread: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  markSent: vi.fn(),
  findSettings: vi.fn(),
  upsertSetting: vi.fn(),
}
const mockCache = {
  pushRecent: vi.fn(),
  getRecent: vi.fn(),
  setRecent: vi.fn(),
  getUnread: vi.fn(),
  invalidateRecent: vi.fn(),
  getUpcoming: vi.fn(),
  setUpcoming: vi.fn(),
}
const mockQueue = { deliver: vi.fn(), requestRefresh: vi.fn() }
const mockCalendar = { upcoming: vi.fn() }
const mockTelegram = { sendMessage: vi.fn() }

const notification = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'n1',
  kind: NotificationKind.DUE,
  title: '🏠 Luz',
  body: 'Vence mañana (vie 25/09): S/ 120.00.',
  amount: 120,
  refType: NotificationRefType.FIXED_COST,
  refId: 'f1',
  eventDate: null,
  dedupeKey: 'due:fixed_cost:f1:2026-09-25',
  readAt: null,
  telegramChatId: null,
  telegramMessageId: null,
  telegramSentAt: null,
  createdAt: new Date('2026-09-24T14:00:00Z'),
  ...overrides,
})

const input = { kind: NotificationKind.DUE, title: 'Luz', body: 'Vence', dedupeKey: 'due:1' }

describe('NotificationsService', () => {
  let service: NotificationsService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationDBRepository, useValue: mockDB },
        { provide: NotificationCache, useValue: mockCache },
        { provide: NotificationQueue, useValue: mockQueue },
        { provide: CalendarService, useValue: mockCalendar },
        { provide: TelegramClient, useValue: mockTelegram },
        {
          provide: ConfigService,
          useValue: new ConfigService({ telegram: { botToken: '1:a', allowedChatIds: ['555', '777'] } }),
        },
      ],
    }).compile()
    service = module.get(NotificationsService)
    mockDB.findSettings.mockResolvedValue([])
    mockDB.createUnique.mockImplementation(async (data) => notification({ ...data, id: 'n1' }))
    mockQueue.deliver.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('notify', () => {
    it('should save it once, add it to the bell and queue it for Telegram', async () => {
      const created = await service.notify(input)

      expect(mockDB.createUnique).toHaveBeenCalledWith({ ...input, readAt: null })
      expect(mockCache.pushRecent).toHaveBeenCalledWith(created)
      expect(mockQueue.deliver).toHaveBeenCalledWith('n1')
      expect(mockTelegram.sendMessage).not.toHaveBeenCalled()
    })

    it('should do nothing more when the notice already exists (dedupeKey)', async () => {
      mockDB.createUnique.mockResolvedValue(null)

      expect(await service.notify(input)).toBeNull()
      expect(mockCache.pushRecent).not.toHaveBeenCalled()
      expect(mockQueue.deliver).not.toHaveBeenCalled()
    })

    it('should keep it read when the web is off, and skip Telegram when Telegram is off', async () => {
      mockDB.findSettings.mockResolvedValue([{ kind: NotificationKind.DUE, telegram: false, web: false }])
      expect(await service.notify(input)).toBeNull()

      mockDB.findSettings.mockResolvedValue([{ kind: NotificationKind.DUE, telegram: true, web: false }])
      await service.notify(input)
      expect(mockDB.createUnique).toHaveBeenLastCalledWith({ ...input, readAt: expect.any(Date) })
      expect(mockCache.pushRecent).not.toHaveBeenCalled()
      expect(mockQueue.deliver).toHaveBeenCalled()
    })

    it('should send it right away without Redis', async () => {
      mockQueue.deliver.mockResolvedValue(false)
      mockDB.findById.mockResolvedValue(notification())
      mockTelegram.sendMessage.mockResolvedValue({ message_id: 42 })

      await service.notify(input)

      expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(2)
      expect(mockDB.markSent).toHaveBeenCalledWith('n1', '555', '42')
    })
  })

  describe('deliver', () => {
    it('should send the notice with its buttons to every allowed chat and remember the first message', async () => {
      mockDB.findById.mockResolvedValue(notification())
      mockTelegram.sendMessage.mockResolvedValue({ message_id: 9 })

      await service.deliver('n1')

      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        '555',
        '<b>🏠 Luz</b>\nVence mañana (vie 25/09): S/ 120.00.',
        expect.objectContaining({ inline_keyboard: expect.any(Array) }),
      )
      expect(mockDB.markSent).toHaveBeenCalledWith('n1', '555', '9')
    })

    it('should not send a notice twice (a retry after it went out)', async () => {
      mockDB.findById.mockResolvedValue(notification({ telegramSentAt: new Date() }))

      await service.deliver('n1')

      expect(mockTelegram.sendMessage).not.toHaveBeenCalled()
    })

    it('should let a Telegram error through so BullMQ retries', async () => {
      mockDB.findById.mockResolvedValue(notification())
      mockTelegram.sendMessage.mockRejectedValue(new Error('502'))

      await expect(service.deliver('n1')).rejects.toThrow('502')
      expect(mockDB.markSent).not.toHaveBeenCalled()
    })
  })

  describe('bell', () => {
    it('should read the latest ones from Redis and rebuild them from the database when missing', async () => {
      mockCache.getRecent.mockResolvedValueOnce([notification()])
      expect(await service.recent(20)).toEqual([notification()])
      expect(mockDB.findMany).not.toHaveBeenCalled()

      mockCache.getRecent.mockResolvedValueOnce(null)
      mockDB.findMany.mockResolvedValue({ items: [notification(), notification({ id: 'n2' })], total: 2 })
      mockDB.countUnread.mockResolvedValue(2)
      expect(await service.recent(1)).toHaveLength(1)
      expect(mockCache.setRecent).toHaveBeenCalledWith(expect.any(Array), 2)
    })

    it('should count unread from Redis or the database', async () => {
      mockCache.getUnread.mockResolvedValueOnce(3).mockResolvedValueOnce(null)
      mockDB.countUnread.mockResolvedValue(5)

      expect(await service.unreadCount()).toBe(3)
      expect(await service.unreadCount()).toBe(5)
    })

    it('should drop the cached list only when something was read', async () => {
      mockDB.markRead.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
      await service.markRead('n1')
      await service.markRead('n1')
      mockDB.markAllRead.mockResolvedValue(0)
      await service.markAllRead()

      expect(mockCache.invalidateRecent).toHaveBeenCalledTimes(1)
    })
  })

  it('should merge the saved settings with the defaults and change only what is sent', async () => {
    mockDB.findSettings.mockResolvedValue([{ kind: NotificationKind.WEEKLY, telegram: false, web: true }])

    const settings = await service.settings()
    expect(settings[NotificationKind.WEEKLY]).toEqual({ telegram: false, web: true })
    expect(settings[NotificationKind.DAILY_CLOSE]).toEqual({ telegram: false, web: true })
    expect(settings[NotificationKind.DUE]).toEqual({ telegram: true, web: true })

    await service.updateSettings({ [NotificationKind.DUE]: { web: false } })
    expect(mockDB.upsertSetting).toHaveBeenCalledWith(NotificationKind.DUE, true, false)
  })

  it('should read the upcoming reminders from Redis and rebuild them when missing', async () => {
    const event = { date: '2099-01-01' }
    mockCache.getUpcoming.mockResolvedValueOnce([event])
    expect(await service.upcoming(14)).toEqual([event])

    mockCache.getUpcoming.mockResolvedValueOnce(null)
    mockCalendar.upcoming.mockResolvedValue([])
    expect(await service.upcoming(14)).toEqual([])
    expect(mockCache.setUpcoming).toHaveBeenCalledWith([])
  })
})
