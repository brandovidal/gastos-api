import { Test } from '@nestjs/testing'
import { vi } from 'vitest'

import { Notification } from '@/generated/prisma/client'
import { PaymentOutcome } from '@/commons/constants/calendar.constant'
import { BotAction } from '@/commons/constants/conversation.constant'
import { NotificationKind, NotificationOp, NotificationRefType } from '@/commons/constants/notification.constant'
import { CalendarDBRepository } from '@/db/models/calendar/calendarDB.repository'
import { CalendarService } from '@/modules/calendar/calendar.service'
import { DebtsService } from '@/modules/debts/debts.service'

import { NotificationCache } from './notification-cache.service'
import { NotificationQueue } from './notification-queue.service'
import { NotificationsBotService } from './notifications-bot.service'
import { NotificationsService } from './notifications.service'

const CHAT_ID = '555'

const mockNotifications = {
  findById: vi.fn(),
  markRead: vi.fn(),
  settings: vi.fn(),
  updateSettings: vi.fn(),
  upcoming: vi.fn(),
}
const mockCache = { setAwaitingAmount: vi.fn(), getAwaitingAmount: vi.fn(), clearAwaitingAmount: vi.fn() }
const mockQueue = { requestRefresh: vi.fn() }
const mockCalendar = { installments: vi.fn(), pay: vi.fn() }
const mockCalendarDB = {
  setFixedCostAmount: vi.fn(),
  setSubscriptionAmount: vi.fn(),
}
const mockDebts = { get: vi.fn(), addPayment: vi.fn() }

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
  createdAt: new Date(),
  ...overrides,
})

const press = (op: NotificationOp) => ({ name: BotAction.NOTIFY, draftId: 'n1', value: op })

const settings = (telegram: boolean) =>
  Object.fromEntries(Object.values(NotificationKind).map((kind) => [kind, { telegram, web: true }]))

describe('NotificationsBotService', () => {
  let service: NotificationsBotService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        NotificationsBotService,
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: NotificationCache, useValue: mockCache },
        { provide: NotificationQueue, useValue: mockQueue },
        { provide: CalendarService, useValue: mockCalendar },
        { provide: CalendarDBRepository, useValue: mockCalendarDB },
        { provide: DebtsService, useValue: mockDebts },
      ],
    }).compile()
    service = module.get(NotificationsBotService)
    mockNotifications.findById.mockResolvedValue(notification())
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('✅ Pagado', () => {
    it('should pay what the notice points to, mark it read and close its message without buttons', async () => {
      mockCalendar.pay.mockResolvedValue(PaymentOutcome.PAID)

      const result = await service.handleAction(CHAT_ID, press(NotificationOp.PAID))

      expect(mockCalendar.pay).toHaveBeenCalledWith(NotificationRefType.FIXED_COST, 'f1')
      expect(mockNotifications.markRead).toHaveBeenCalledWith('n1')
      expect(mockQueue.requestRefresh).toHaveBeenCalled()
      expect(result).toEqual({
        replies: [{ text: '<b>🏠 Luz</b>\nVence mañana (vie 25/09): S/ 120.00.\n\n✅ Pagado', edit: true }],
        notice: '✅ Pagado',
      })
    })

    it.each([
      [PaymentOutcome.ALREADY_PAID, 'Ya estaba pagado'],
      [PaymentOutcome.NOTHING_TO_PAY, 'No hay nada pendiente de ese pago'],
      [PaymentOutcome.NOT_FOUND, 'Este aviso ya no existe'],
    ])('should answer %s without refreshing the reminders', async (outcome, notice) => {
      mockCalendar.pay.mockResolvedValue(outcome)

      expect((await service.handleAction(CHAT_ID, press(NotificationOp.PAID))).notice).toBe(notice)
      expect(mockQueue.requestRefresh).not.toHaveBeenCalled()
    })
  })

  it('should answer a button of a notice that no longer exists', async () => {
    mockNotifications.findById.mockRejectedValue(new Error('not found'))

    expect(await service.handleAction(CHAT_ID, press(NotificationOp.PAID))).toEqual({
      replies: [],
      notice: 'Este aviso ya no existe',
    })
  })

  it('should silence that kind in Telegram', async () => {
    const result = await service.handleAction(CHAT_ID, press(NotificationOp.MUTE))

    expect(mockNotifications.updateSettings).toHaveBeenCalledWith({ [NotificationKind.DUE]: { telegram: false } })
    expect(result.replies[0]).toMatchObject({
      edit: true,
      text: expect.stringContaining('Vencimientos (un día antes)'),
    })
  })

  describe('✏️ Editar monto', () => {
    it('should wait for the amount and save it on the fixed cost', async () => {
      const ask = await service.handleAction(CHAT_ID, press(NotificationOp.EDIT_AMOUNT))
      expect(mockCache.setAwaitingAmount).toHaveBeenCalledWith(CHAT_ID, 'n1')
      expect(ask.replies[0].text).toContain('Escribe el monto correcto de <b>🏠 Luz</b>')

      mockCache.getAwaitingAmount.mockResolvedValue('n1')
      mockCalendarDB.setFixedCostAmount.mockResolvedValue(true)
      const replies = await service.answerAmount(CHAT_ID, 'S/ 132,50')

      expect(mockCalendarDB.setFixedCostAmount).toHaveBeenCalledWith('f1', 132.5)
      expect(replies).toEqual([{ text: '✅ 🏠 Luz: el monto ahora es S/ 132.50.' }])
      expect(mockCache.clearAwaitingAmount).toHaveBeenCalledWith(CHAT_ID)
    })

    it('should register a payment of a debt and keep waiting when it is more than the balance', async () => {
      mockCache.getAwaitingAmount.mockResolvedValue('n1')
      mockNotifications.findById.mockResolvedValue(
        notification({ title: 'Danery te debe', refType: NotificationRefType.DEBT, refId: 'd1' }),
      )
      mockDebts.get.mockResolvedValue({ balance: 100 })

      expect(await service.answerAmount(CHAT_ID, '150')).toEqual([
        { text: '⚠️ Es más de lo que falta pagar (S/ 100.00). Escribe otro monto.' },
      ])
      expect(mockCache.clearAwaitingAmount).not.toHaveBeenCalled()

      expect(await service.answerAmount(CHAT_ID, '40')).toEqual([
        { text: '✅ Registré un pago de S/ 40.00 de Danery te debe.' },
      ])
      expect(mockDebts.addPayment).toHaveBeenCalledWith('d1', { amount: 40 })
    })

    it('should let any other message through and stop waiting', async () => {
      mockCache.getAwaitingAmount.mockResolvedValueOnce(null).mockResolvedValueOnce('n1')

      expect(await service.answerAmount(CHAT_ID, '45')).toBeNull()
      expect(await service.answerAmount(CHAT_ID, 'almuerzo 25 yape')).toBeNull()
      expect(mockCache.clearAwaitingAmount).toHaveBeenCalledWith(CHAT_ID)
    })
  })

  it('should turn a kind on or off from /avisos and redraw the buttons', async () => {
    mockNotifications.settings.mockResolvedValue(settings(true))
    mockNotifications.updateSettings.mockResolvedValue(settings(false))

    const result = await service.handleAction(CHAT_ID, {
      name: BotAction.NOTIFY_SETTING,
      draftId: NotificationKind.WEEKLY,
    })

    expect(mockNotifications.updateSettings).toHaveBeenCalledWith({ [NotificationKind.WEEKLY]: { telegram: false } })
    expect(result.replies[0]).toMatchObject({ edit: true })
    expect(result.replies[0].buttons?.[0][0].label).toBe('🔕 Vencimientos (un día antes)')
    expect(await service.handleAction(CHAT_ID, { name: BotAction.NOTIFY_SETTING, draftId: 'nope' })).toEqual({
      replies: [],
    })
  })
})
