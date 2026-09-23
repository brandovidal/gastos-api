import { Injectable, Logger } from '@nestjs/common'

import { APP_TIME_ZONE } from '@/commons/constants/app.constant'
import {
  BotAction,
  BotCommand,
  CARD_DAYS_FIELD_PREFIX,
  ChannelMessageType,
  FREE_CORRECTION_FIELD,
  DRAFTS_LIMIT,
  MAX_AUDIO_SECONDS,
  MAX_IMAGE_BYTES,
  RECENT_EXPENSES_LIMIT,
} from '@/commons/constants/conversation.constant'
import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import { ExpenseDestination, SubscriptionPeriod } from '@/commons/constants/expense.constant'
import {
  EXPENSE_DRAFT_EXPIRATION_MINUTES,
  ExpenseDraftChannel,
  ExpenseDraftInputType,
  ExpenseDraftStatus,
  OPEN_EXPENSE_DRAFT_STATUSES,
  REVIEW_EXPENSE_DRAFT_STATUSES,
} from '@/commons/constants/expense-draft.constant'
import { ExpenseField } from '@/commons/constants/expense-extraction.constant'
import { DateHelper } from '@/commons/helpers/date.helper'
import { DuplicateExpenseDraftException } from '@/commons/exceptions/expense-draft/duplicate-expense-draft.exception'
import { ExpenseDraftDBRepository } from '@/db/models/expense-draft/expenseDraftDB.repository'
import { ExpenseDraftDbDto } from '@/db/models/expense-draft/expenseDraftDB.dto'
import { ExpenseDBRepository } from '@/db/models/expense/expenseDB.repository'
import { PaymentMethodDBRepository } from '@/db/models/payment-method/paymentMethodDB.repository'
import { ExpenseExtractionService } from '@/modules/expense-extraction/expense-extraction.service'
import { completeExpense } from '@/modules/expense-extraction/expense-extraction.resolver'
import { findCatalogEntryById } from '@/modules/expense-extraction/expense-extraction.catalog'
import {
  ExtractionCatalog,
  ResolvedExpense,
  ResolvedExpenseFields,
  MediaFile,
} from '@/modules/expense-extraction/dto/expense-extraction.types'

import { ExpenseSaverService } from './expense-saver.service'
import { MediaDownloaderRegistry } from './media-downloader.registry'
import { toExpenseFields, toExpenseDraftUpdate } from './expense-draft.mapper'
import {
  DESTINATION_LABELS,
  TEXTS,
  buildClosedReply,
  buildExpenseReply,
  buildDraftReplies,
  buildNewPaymentMethodReply,
  formatMonthlyTotals,
  formatAiUsage,
  formatRecent,
  toNewPaymentMethodName,
} from './conversation.messages'
import { BotActionPayload, BotReply, ChannelMessage, ConversationResult } from './dto/conversation.types'

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'setiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

// Closed-for-now expenses of Borrador that accept only Retomar and Descartar
const PARKED_STATUSES = [ExpenseDraftStatus.PENDING_REVIEW, ExpenseDraftStatus.FAILED]

// "cierre 15, pago 5" or "15 5"
const CARD_DAYS_REGEX = /(\d{1,2})\D+(\d{1,2})/

// Channel-agnostic conversation: one ExpenseDraft per expense, one question at a time, confirm with buttons
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name)

  constructor(
    private readonly expenseDraftDBRepository: ExpenseDraftDBRepository,
    private readonly expenseDBRepository: ExpenseDBRepository,
    private readonly paymentMethodDBRepository: PaymentMethodDBRepository,
    private readonly expenseExtractionService: ExpenseExtractionService,
    private readonly expenseSaverService: ExpenseSaverService,
    private readonly mediaDownloaderRegistry: MediaDownloaderRegistry,
  ) {}

  async handle(message: ChannelMessage): Promise<ConversationResult> {
    switch (message.type) {
      case ChannelMessageType.COMMAND:
        return { replies: await this.handleCommand(message) }
      case ChannelMessageType.ACTION:
        return this.handleAction(message)
      case ChannelMessageType.IMAGE:
      case ChannelMessageType.AUDIO:
        return { replies: await this.handleMedia(message) }
      default:
        return { replies: await this.handleText(message) }
    }
  }

  private async handleText(message: ChannelMessage): Promise<BotReply[]> {
    const text = message.text?.trim()
    if (!text) return []

    const active = await this.findActive(message)

    if (active) {
      if (active.pendingField === FREE_CORRECTION_FIELD) {
        return [await this.correctWithAi(active, text)]
      }

      if (active.pendingField?.startsWith(CARD_DAYS_FIELD_PREFIX)) {
        return this.saveCardDays(active, text)
      }

      // Answer to the pending question, or a correction that starts with a keyword ("monto 30")
      const correction = await this.expenseExtractionService.parseLocalCorrection(
        text,
        active.pendingField as ExpenseField | null,
      )

      if (correction) {
        return [await this.applyCorrection(active, correction)]
      }

      // Asked for the payment method and got a name we do not know: offer to add it
      if (active.pendingField === ExpenseField.PAYMENT_METHOD && this.looksLikeName(text)) {
        return [buildNewPaymentMethodReply(active.id, toNewPaymentMethodName(text))]
      }
    }

    return this.registerNewExpenses(message, text)
  }

  private async registerNewExpenses(message: ChannelMessage, text: string): Promise<BotReply[]> {
    let expenseDraft: ExpenseDraftDbDto

    try {
      expenseDraft = await this.expenseDraftDBRepository.create({
        channel: message.channel,
        chatId: message.chatId,
        messageId: message.messageId,
        inputType: ExpenseDraftInputType.TEXT,
        rawText: text,
      })
    } catch (error) {
      // Webhook retry of a message already handled
      if (error instanceof DuplicateExpenseDraftException) return []
      throw error
    }

    return this.extractInto(expenseDraft)
  }

  // An image (receipt photo, Yape/Plin screenshot) or a voice note is always a new message: an image caption adds
  // details for every expense in it and is never read as a correction of the open draft
  private async handleMedia(message: ChannelMessage): Promise<BotReply[]> {
    const { media } = message
    if (!media) return []

    const isAudio = message.type === ChannelMessageType.AUDIO
    if (!isAudio && media.sizeBytes && media.sizeBytes > MAX_IMAGE_BYTES) return [{ text: TEXTS.imageTooLarge }]
    if (isAudio && media.durationSeconds && media.durationSeconds > MAX_AUDIO_SECONDS) {
      return [{ text: TEXTS.audioTooLong(MAX_AUDIO_SECONDS) }]
    }

    const previous = await this.expenseDraftDBRepository.findByMediaUniqueId(
      message.channel,
      message.chatId,
      media.uniqueId,
    )
    if (previous) return [{ text: isAudio ? TEXTS.duplicateAudio : TEXTS.duplicateImage }]

    let expenseDraft: ExpenseDraftDbDto
    try {
      expenseDraft = await this.expenseDraftDBRepository.create({
        channel: message.channel,
        chatId: message.chatId,
        messageId: message.messageId,
        inputType: isAudio ? ExpenseDraftInputType.AUDIO : ExpenseDraftInputType.IMAGE,
        // Audio: rawText is filled with the transcription
        rawText: isAudio ? null : message.text?.trim() || null,
        mediaFileId: media.fileId,
        mediaUniqueId: media.uniqueId,
        storageKey: media.storageKey ?? null,
      })
    } catch (error) {
      if (error instanceof DuplicateExpenseDraftException) return []
      throw error
    }

    return this.extractInto(expenseDraft)
  }

  // Runs the AI on a row (new message or a failed one resumed from /borrador) and shows one summary per expense.
  // The input comes from the row itself: its text or caption, its image downloaded again from the channel, or its
  // voice note transcribed once (the transcription is kept in rawText, so a retry only repeats the extraction).
  private async extractInto(expenseDraft: ExpenseDraftDbDto, edit = false): Promise<BotReply[]> {
    let expenses: ResolvedExpense[]
    let text = expenseDraft.rawText ?? undefined
    const isAudio = expenseDraft.inputType === ExpenseDraftInputType.AUDIO

    try {
      if (isAudio && !text) {
        text = await this.transcribe(expenseDraft)
        if (!text) {
          await this.expenseDraftDBRepository.update(expenseDraft.id, { status: ExpenseDraftStatus.DISCARDED })
          return [{ text: TEXTS.emptyAudio, edit }]
        }
      }

      const images =
        expenseDraft.inputType === ExpenseDraftInputType.IMAGE && expenseDraft.mediaFileId
          ? [await this.download(expenseDraft)]
          : undefined
      ;({ expenses } = await this.expenseExtractionService.extract({ text, images, draftId: expenseDraft.id }))
    } catch (error) {
      this.logger.warn(`[extractInto] extraction failed: ${(error as Error).message}`)
      await this.expenseDraftDBRepository.update(expenseDraft.id, { status: ExpenseDraftStatus.FAILED })
      return [{ text: TEXTS.failed, edit }]
    }

    // Voice notes show what was understood, so a wrong transcription is easy to spot
    const heard = isAudio && text ? `${TEXTS.heard(text)}\n\n` : ''

    if (!expenses.length) {
      await this.expenseDraftDBRepository.update(expenseDraft.id, { status: ExpenseDraftStatus.DISCARDED })
      return [{ text: `${heard}${TEXTS.notAnExpense}`, edit }]
    }

    const catalog = await this.expenseExtractionService.loadCatalog()
    const replies: BotReply[] = []

    for (const [index, expense] of expenses.entries()) {
      const target =
        index === 0
          ? expenseDraft
          : await this.expenseDraftDBRepository.create({
              channel: expenseDraft.channel,
              chatId: expenseDraft.chatId,
              messageId: expenseDraft.messageId,
              itemIndex: expenseDraft.itemIndex + index,
              inputType: expenseDraft.inputType,
              rawText: text ?? null,
              mediaFileId: expenseDraft.mediaFileId,
            })

      const updated = await this.expenseDraftDBRepository.update(target.id, toExpenseDraftUpdate(expense))
      const reply = await this.withDuplicateWarning(updated, this.replyFor(updated, catalog, edit && index === 0))
      replies.push(index === 0 && heard ? { ...reply, text: `${heard}${reply.text}` } : reply)
    }

    return replies
  }

  private download(expenseDraft: ExpenseDraftDbDto): Promise<MediaFile> {
    if (!expenseDraft.mediaFileId) throw new Error('The expense draft has no media file')
    return this.mediaDownloaderRegistry.download(expenseDraft.channel as ExpenseDraftChannel, expenseDraft.mediaFileId)
  }

  // Downloads the voice note, transcribes it and keeps the text in rawText
  private async transcribe(expenseDraft: ExpenseDraftDbDto): Promise<string> {
    const audio = await this.download(expenseDraft)
    const text = await this.expenseExtractionService.transcribe({ audio, draftId: expenseDraft.id })
    if (text) await this.expenseDraftDBRepository.update(expenseDraft.id, { rawText: text })
    return text
  }

  private async applyCorrection(
    expenseDraft: ExpenseDraftDbDto,
    correction: Partial<ResolvedExpenseFields>,
    edit = false,
  ): Promise<BotReply> {
    // What the user says is certain: corrected fields lose their ❓
    const confidence = { ...expenseDraft.confidence }
    for (const field of Object.keys(correction)) confidence[field] = 1

    const catalog = await this.expenseExtractionService.loadCatalog()
    const expense = completeExpense({ ...toExpenseFields(expenseDraft), ...correction }, confidence, catalog)
    const updated = await this.expenseDraftDBRepository.update(expenseDraft.id, toExpenseDraftUpdate(expense))

    return this.replyFor(updated, catalog, edit)
  }

  private async correctWithAi(expenseDraft: ExpenseDraftDbDto, text: string): Promise<BotReply> {
    try {
      const { expenses } = await this.expenseExtractionService.extract({
        text,
        draft: toExpenseFields(expenseDraft),
        draftId: expenseDraft.id,
      })

      if (expenses[0]) {
        const updated = await this.expenseDraftDBRepository.update(expenseDraft.id, toExpenseDraftUpdate(expenses[0]))
        return this.replyFor(updated, await this.expenseExtractionService.loadCatalog())
      }
    } catch (error) {
      this.logger.warn(`[correctWithAi] extraction failed: ${(error as Error).message}`)
    }

    // Leave correction mode so the next message is handled normally
    await this.expenseDraftDBRepository.update(expenseDraft.id, { pendingField: expenseDraft.missingFields[0] ?? null })
    return { text: TEXTS.correctionFailed }
  }

  private async handleAction(message: ChannelMessage): Promise<ConversationResult> {
    const action = message.action as BotActionPayload
    const expenseDraft = await this.expenseDraftDBRepository.findById(action.draftId)
    const status = expenseDraft?.status as ExpenseDraftStatus | undefined

    // Open expenses accept every button; pending and failed ones only Retomar and Descartar (from /borrador)
    const isOwn = expenseDraft?.chatId === message.chatId
    const isOpen = status !== undefined && OPEN_EXPENSE_DRAFT_STATUSES.includes(status)
    const isParked = status !== undefined && PARKED_STATUSES.includes(status)
    const allowed =
      isOwn && (isOpen || (isParked && (action.name === BotAction.RESUME || action.name === BotAction.DISCARD)))

    if (!expenseDraft || !allowed) {
      return { replies: [], notice: TEXTS.alreadyProcessed }
    }

    const catalog = await this.expenseExtractionService.loadCatalog()

    switch (action.name) {
      case BotAction.SAVE: {
        if (expenseDraft.missingFields.length) {
          return { replies: [this.replyFor(expenseDraft, catalog, true)] }
        }
        await this.expenseSaverService.save(expenseDraft)
        const saved = { ...expenseDraft, status: ExpenseDraftStatus.SAVED }
        const label = DESTINATION_LABELS[expenseDraft.destination as ExpenseDestination]
        return { replies: [buildClosedReply(`✅ <b>Guardado en ${label}</b>`, saved, catalog)], notice: TEXTS.saved }
      }
      case BotAction.EDIT:
        await this.expenseDraftDBRepository.update(expenseDraft.id, { pendingField: FREE_CORRECTION_FIELD })
        return { replies: [{ text: TEXTS.askCorrection }] }
      case BotAction.LATER: {
        const updated = await this.expenseDraftDBRepository.update(expenseDraft.id, {
          status: ExpenseDraftStatus.PENDING_REVIEW,
          pendingField: null,
        })
        return { replies: [buildClosedReply('📝 <b>En borrador</b>', updated, catalog)] }
      }
      case BotAction.DISCARD: {
        const updated = await this.expenseDraftDBRepository.update(expenseDraft.id, {
          status: ExpenseDraftStatus.DISCARDED,
          pendingField: null,
        })
        return { replies: [buildClosedReply('❌ <b>Descartado</b>', updated, catalog)] }
      }
      case BotAction.RESUME:
        return { replies: await this.resume(expenseDraft, catalog), notice: TEXTS.resumed }
      case BotAction.NEW_PAYMENT_METHOD:
        return { replies: await this.createPaymentMethod(expenseDraft, action) }
      case BotAction.SET_FIELD: {
        const correction = this.toFieldCorrection(action, catalog)
        if (!correction) return { replies: [], notice: TEXTS.alreadyProcessed }
        return { replies: [await this.applyCorrection(expenseDraft, correction, true)] }
      }
      default:
        return { replies: [] }
    }
  }

  // Reopens a pending expense (or retries the AI on a failed one) and shows it with its buttons again
  private async resume(expenseDraft: ExpenseDraftDbDto, catalog: ExtractionCatalog): Promise<BotReply[]> {
    if (expenseDraft.status === ExpenseDraftStatus.FAILED) {
      return this.extractInto(expenseDraft, true)
    }

    const expense = completeExpense(toExpenseFields(expenseDraft), expenseDraft.confidence, catalog)
    const updated = await this.expenseDraftDBRepository.update(expenseDraft.id, toExpenseDraftUpdate(expense))
    return [this.replyFor(updated, catalog, true)]
  }

  // "No conozco bbva": the user picked a type (create it and use it) or "No"
  private async createPaymentMethod(expenseDraft: ExpenseDraftDbDto, { field, value }: BotActionPayload) {
    const type = field as PaymentMethodType | undefined

    if (!type || !value || !(Object.values(PaymentMethodType) as string[]).includes(type)) {
      return [{ text: TEXTS.paymentMethodNotAdded, edit: true }]
    }

    const paymentMethod = await this.paymentMethodDBRepository.create(value, type)
    const created: BotReply = { text: TEXTS.paymentMethodCreated(paymentMethod.name), edit: true }
    const next = await this.applyCorrection(expenseDraft, { paymentMethodId: paymentMethod.id })

    // A new credit card needs its billing days to know the payment month
    if (type === PaymentMethodType.CREDIT_CARD) {
      await this.expenseDraftDBRepository.update(expenseDraft.id, {
        pendingField: `${CARD_DAYS_FIELD_PREFIX}${paymentMethod.id}`,
      })
      return [created, { text: TEXTS.askCardDays }]
    }

    return [created, next]
  }

  private async saveCardDays(expenseDraft: ExpenseDraftDbDto, text: string): Promise<BotReply[]> {
    const paymentMethodId = (expenseDraft.pendingField as string).slice(CARD_DAYS_FIELD_PREFIX.length)
    const match = text.match(CARD_DAYS_REGEX)
    const [closeDay, dueDay] = match ? [Number(match[1]), Number(match[2])] : [0, 0]

    if (!match || closeDay < 1 || closeDay > 31 || dueDay < 1 || dueDay > 31) {
      return [{ text: TEXTS.cardDaysInvalid }]
    }

    const card = await this.paymentMethodDBRepository.updateBillingDays(paymentMethodId, closeDay, dueDay)
    // Back to the normal flow: next missing field or the confirmation buttons
    const next = await this.applyCorrection(expenseDraft, { paymentMethodId })

    return [{ text: TEXTS.cardDaysSaved(card.name) }, next]
  }

  // Values from quick reply buttons are checked again: the button may be older than the catalog
  private toFieldCorrection(
    { field, value }: BotActionPayload,
    catalog: ExtractionCatalog,
  ): Partial<ResolvedExpenseFields> | null {
    if (!field || !value) return null

    switch (field) {
      case ExpenseField.DESTINATION:
        return (Object.values(ExpenseDestination) as string[]).includes(value) ? { destination: value } : null
      case ExpenseField.PERIOD:
        return (Object.values(SubscriptionPeriod) as string[]).includes(value) ? { period: value } : null
      case ExpenseField.PAYMENT_METHOD:
      case ExpenseField.CATEGORY:
      case ExpenseField.PERSON:
        return findCatalogEntryById(catalog, value) ? { [field]: value } : null
      default:
        return null
    }
  }

  private async handleCommand(message: ChannelMessage): Promise<BotReply[]> {
    switch (message.command) {
      case BotCommand.CANCEL: {
        const count = await this.expenseDraftDBRepository.discardOpenByChat(message.channel, message.chatId)
        return [{ text: TEXTS.cancelled(count) }]
      }
      case BotCommand.USAGE: {
        return [{ text: formatAiUsage(await this.expenseExtractionService.getUsage()) }]
      }
      case BotCommand.RECENT: {
        const recent = await this.expenseDraftDBRepository.findRecentSaved(
          message.channel,
          message.chatId,
          RECENT_EXPENSES_LIMIT,
        )
        return [{ text: formatRecent(recent) }]
      }
      case BotCommand.DRAFTS: {
        const [{ items, total }, catalog] = await Promise.all([
          this.expenseDraftDBRepository.findByStatuses(
            message.channel,
            message.chatId,
            REVIEW_EXPENSE_DRAFT_STATUSES,
            DRAFTS_LIMIT,
          ),
          this.expenseExtractionService.loadCatalog(),
        ])
        return buildDraftReplies(items, total, catalog)
      }
      case BotCommand.SUMMARY: {
        const today = DateHelper.todayIn(APP_TIME_ZONE)
        const month = Number(today.slice(5, 7))
        const year = Number(today.slice(0, 4))
        const [totals, catalog] = await Promise.all([
          this.expenseDBRepository.findMonthlyTotals(month, year),
          this.expenseExtractionService.loadCatalog(),
        ])
        return [{ text: formatMonthlyTotals(totals, catalog, `${MONTH_NAMES[month - 1]} ${year}`) }]
      }
      default:
        return [{ text: TEXTS.help }]
    }
  }

  // The same receipt already saved (same operation number, e.g. typed first and then sent as a screenshot)
  private async withDuplicateWarning(expenseDraft: ExpenseDraftDbDto, reply: BotReply): Promise<BotReply> {
    const { operationNumber } = expenseDraft
    if (!operationNumber) return reply

    const duplicated = await this.expenseDraftDBRepository.existsSavedWithOperationNumber(
      operationNumber,
      expenseDraft.id,
    )
    return duplicated ? { ...reply, text: `${TEXTS.possibleDuplicate(operationNumber)}\n\n${reply.text}` } : reply
  }

  // A short text without digits ("bbva", "tarjeta ripley"); anything with an amount is a new expense
  private looksLikeName(text: string): boolean {
    return !/\d/.test(text) && text.split(/\s+/).length <= 3
  }

  // kogane-app "Reintentar" (P7): runs the AI again on a failed draft (the image or voice note is downloaded
  // again from its channel). The result stays in Borrador, so it does not reopen the chat conversation.
  async retryExtraction(expenseDraft: ExpenseDraftDbDto): Promise<void> {
    await this.extractInto(expenseDraft)
    await this.expenseDraftDBRepository.parkMessage(
      expenseDraft.channel as ExpenseDraftChannel,
      expenseDraft.chatId,
      expenseDraft.messageId,
    )
  }

  // Called when the app starts: drafts left without extraction by a restart become failed (retry from /borrador)
  recoverInterrupted(channel: ExpenseDraftChannel, before: Date): Promise<{ chatId: string; count: number }[]> {
    return this.expenseDraftDBRepository.failInterruptedUpdatedBefore(channel, before)
  }

  // The latest open expense draft is the one text corrections apply to; stale ones go to Borrador first
  // (pending_review, or failed when the AI never finished)
  private async findActive(message: ChannelMessage): Promise<ExpenseDraftDbDto | null> {
    const cutoff = new Date(Date.now() - EXPENSE_DRAFT_EXPIRATION_MINUTES * 60_000)
    await this.expenseDraftDBRepository.failInterruptedUpdatedBefore(message.channel, cutoff, message.chatId)
    await this.expenseDraftDBRepository.moveStaleOpenToReview(message.channel, message.chatId, cutoff)
    return this.expenseDraftDBRepository.findOpenByChat(message.channel, message.chatId, cutoff)
  }

  private replyFor(expenseDraft: ExpenseDraftDbDto, catalog: ExtractionCatalog, edit = false): BotReply {
    if (expenseDraft.status === ExpenseDraftStatus.DISCARDED) {
      return { text: TEXTS.notAnExpense, edit }
    }
    return buildExpenseReply(expenseDraft, catalog, edit)
  }
}
