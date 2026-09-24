import { Injectable, Logger } from '@nestjs/common'

import { Notification } from '@/generated/prisma/client'
import { DEFAULT_INSTALLMENT_MONTHS, PaymentOutcome } from '@/commons/constants/calendar.constant'
import { BotAction } from '@/commons/constants/conversation.constant'
import { toCents } from '@/commons/constants/debt.constant'
import { NotificationKind, NotificationOp, NotificationRefType } from '@/commons/constants/notification.constant'
import { AppException } from '@/commons/exceptions/app.exception'
import { CalendarDBRepository } from '@/db/models/calendar/calendarDB.repository'
import { CalendarService } from '@/modules/calendar/calendar.service'
import { DebtsService } from '@/modules/debts/debts.service'
import { BotActionPayload, BotReply, ConversationResult } from '@/modules/conversation/dto/conversation.types'

import { NotificationCache } from './notification-cache.service'
import { NotificationQueue } from './notification-queue.service'
import {
  answeredReply,
  buildCalendarReply,
  buildInstallmentsReply,
  buildSettingsReply,
  NTF_TEXTS,
} from './notification.messages'
import { NotificationsService } from './notifications.service'

// /calendario shows the next two weeks
const CALENDAR_DAYS = 14

// "45.90", "45,90", "S/ 45.90"
const AMOUNT_REGEX = /^(?:s\/\.?\s*)?(\d{1,7}(?:[.,]\d{1,2})?)$/i

// The bot side of the reminders (P20, D86): the buttons of a notice (✅ Pagado · ✏️ Editar monto · 🔕 Silenciar),
// the amount typed after ✏️, and /avisos, /calendario and /cuotas. ConversationService hands these over.
@Injectable()
export class NotificationsBotService {
  private readonly logger = new Logger(NotificationsBotService.name)

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationCache: NotificationCache,
    private readonly notificationQueue: NotificationQueue,
    private readonly calendarService: CalendarService,
    private readonly calendarDBRepository: CalendarDBRepository,
    private readonly debtsService: DebtsService,
  ) {}

  async handleAction(chatId: string, action: BotActionPayload): Promise<ConversationResult> {
    if (action.name === BotAction.NOTIFY_SETTING) return this.toggleTelegram(action.draftId)

    const notification = await this.notificationsService.findById(action.draftId).catch(() => null)
    if (!notification) return { replies: [], notice: NTF_TEXTS.notFound }
    await this.notificationsService.markRead(notification.id)

    switch (action.value) {
      case NotificationOp.PAID: {
        const outcome = await this.pay(notification)
        return { replies: [answeredReply(notification, outcome)], notice: outcome }
      }
      case NotificationOp.EDIT_AMOUNT: {
        await this.notificationCache.setAwaitingAmount(chatId, notification.id)
        const ask = notification.refType === NotificationRefType.DEBT ? NTF_TEXTS.askDebtAmount : NTF_TEXTS.askAmount
        return { replies: [{ text: ask(notification.title) }] }
      }
      case NotificationOp.MUTE: {
        const kind = notification.kind as NotificationKind
        await this.notificationsService.updateSettings({ [kind]: { telegram: false } })
        return { replies: [answeredReply(notification, NTF_TEXTS.muted(kind))], notice: NTF_TEXTS.mutedNotice }
      }
      default:
        return { replies: [] }
    }
  }

  // The message after ✏️ Editar monto. null when nothing waits for an amount, or the text is not one (then the
  // message is read as usual and the wait is dropped)
  async answerAmount(chatId: string, text: string): Promise<BotReply[] | null> {
    const notificationId = await this.notificationCache.getAwaitingAmount(chatId)
    if (!notificationId) return null

    const match = AMOUNT_REGEX.exec(text.trim())
    const notification = match ? await this.notificationsService.findById(notificationId).catch(() => null) : null
    if (!match || !notification) {
      await this.notificationCache.clearAwaitingAmount(chatId)
      return null
    }

    const amount = toCents(Number(match[1].replace(',', '.')))
    const reply = await this.applyAmount(notification, amount)
    if (reply.keepWaiting) return [{ text: reply.text }]

    await this.notificationCache.clearAwaitingAmount(chatId)
    this.notificationQueue.requestRefresh()
    return [{ text: reply.text }]
  }

  async settingsReply(): Promise<BotReply> {
    return buildSettingsReply(await this.notificationsService.settings())
  }

  async calendarReply(): Promise<BotReply> {
    return buildCalendarReply(await this.notificationsService.upcoming(CALENDAR_DAYS), CALENDAR_DAYS)
  }

  async installmentsReply(): Promise<BotReply> {
    return buildInstallmentsReply(await this.calendarService.installments(DEFAULT_INSTALLMENT_MONTHS))
  }

  private async toggleTelegram(kind: string): Promise<ConversationResult> {
    if (!(Object.values(NotificationKind) as string[]).includes(kind)) return { replies: [] }
    const current = await this.notificationsService.settings()
    const next = await this.notificationsService.updateSettings({
      [kind]: { telegram: !current[kind as NotificationKind].telegram },
    })
    return { replies: [{ ...buildSettingsReply(next), edit: true }], notice: NTF_TEXTS.settingsSaved }
  }

  // ✅ Pagado: the same payment as the web calendar (CalendarService.pay)
  private async pay(notification: Notification): Promise<string> {
    const outcome = await this.calendarService.pay(notification.refType, notification.refId ?? '')
    if (outcome === PaymentOutcome.PAID) this.notificationQueue.requestRefresh()
    return NTF_TEXTS.outcomes[outcome]
  }

  private async applyAmount(
    notification: Notification,
    amount: number,
  ): Promise<{ text: string; keepWaiting?: boolean }> {
    const refId = notification.refId ?? ''
    try {
      switch (notification.refType) {
        case NotificationRefType.FIXED_COST:
          return (await this.calendarDBRepository.setFixedCostAmount(refId, amount))
            ? { text: NTF_TEXTS.amountSaved(notification.title, amount) }
            : { text: NTF_TEXTS.notFound }
        case NotificationRefType.SUBSCRIPTION:
          return (await this.calendarDBRepository.setSubscriptionAmount(refId, amount))
            ? { text: NTF_TEXTS.amountSaved(notification.title, amount) }
            : { text: NTF_TEXTS.notFound }
        case NotificationRefType.DEBT: {
          const debt = await this.debtsService.get(refId)
          if (amount > debt.balance) return { text: NTF_TEXTS.amountTooHigh(debt.balance), keepWaiting: true }
          await this.debtsService.addPayment(refId, { amount })
          return { text: NTF_TEXTS.paymentSaved(notification.title, amount) }
        }
        default:
          return { text: NTF_TEXTS.notFound }
      }
    } catch (error) {
      if (error instanceof AppException) return { text: NTF_TEXTS.notFound }
      this.logger.error(`[applyAmount] ${(error as Error).message}`)
      throw error
    }
  }
}
