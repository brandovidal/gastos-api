import { randomUUID } from 'node:crypto'

import { Injectable, Logger } from '@nestjs/common'

import { APP_TIME_ZONE } from '@/commons/constants/app.constant'
import {
  BotAction,
  BotCommand,
  CARD_DAYS_FIELD_PREFIX,
  ChannelMessageType,
  BATCH_ACTIONS,
  DEBT_PAYMENT_ACTIONS,
  FREE_CORRECTION_FIELD,
  DRAFTS_LIMIT,
  MAX_AUDIO_SECONDS,
  MAX_IMAGE_BYTES,
  RECENT_EXPENSES_LIMIT,
} from '@/commons/constants/conversation.constant'
import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import { DebtDirection } from '@/commons/constants/debt.constant'
import { ExpenseDestination, SubscriptionPeriod } from '@/commons/constants/expense.constant'
import {
  EXPENSE_DRAFT_EXPIRATION_MINUTES,
  ExpenseDraftChannel,
  ExpenseDraftInputType,
  ExpenseDraftStatus,
  OPEN_EXPENSE_DRAFT_STATUSES,
  REVIEW_EXPENSE_DRAFT_STATUSES,
} from '@/commons/constants/expense-draft.constant'
import { CatalogKind, ExpenseField } from '@/commons/constants/expense-extraction.constant'
import { DateHelper } from '@/commons/helpers/date.helper'
import { DuplicateExpenseDraftException } from '@/commons/exceptions/expense-draft/duplicate-expense-draft.exception'
import { StoredFileExpiredException } from '@/commons/exceptions/stored-file/stored-file-expired.exception'
import { ExpenseDraftDBRepository } from '@/db/models/expense-draft/expenseDraftDB.repository'
import { ExpenseDraftDbDto } from '@/db/models/expense-draft/expenseDraftDB.dto'
import { ExpenseDBRepository } from '@/db/models/expense/expenseDB.repository'
import { PaymentMethodDBRepository } from '@/db/models/payment-method/paymentMethodDB.repository'
import { ExpenseExtractionService } from '@/modules/expense-extraction/expense-extraction.service'
import { completeExpense, withPrimaryCard } from '@/modules/expense-extraction/expense-extraction.resolver'
import { findCatalogEntryById, matchCatalogEntry } from '@/modules/expense-extraction/expense-extraction.catalog'
import { DebtsService } from '@/modules/debts/debts.service'
import { RecognitionService } from '@/modules/recognition/recognition.service'
import { RecognitionResult, RecognizedScreen } from '@/modules/recognition/recognition.templates'
import { StoredFilesService } from '@/modules/stored-files/stored-files.service'
import {
  ExtractionCatalog,
  ResolvedExpense,
  ResolvedExpenseFields,
  MediaFile,
} from '@/modules/expense-extraction/dto/expense-extraction.types'

import { parseDebtPayment } from './debt-payment.parser'
import { sameMerchant } from './duplicate.helper'
import { formatReconciliation } from './recognition.messages'
import {
  buildInstallmentPickerReply,
  buildPaymentProposalReply,
  buildPaymentSavedReply,
  DEBT_TEXTS,
  formatCollectMessage,
  formatDebtSummary,
  formatPersonDebts,
} from './debt.messages'
import { ExpenseSaverService } from './expense-saver.service'
import { MediaDownloaderRegistry } from './media-downloader.registry'
import { toExpenseFields, toExpenseDraftUpdate } from './expense-draft.mapper'
import {
  DESTINATION_LABELS,
  TEXTS,
  formatAmount,
  buildClosedReply,
  buildBatchReply,
  buildParkedNotice,
  buildSavedNotice,
  buildExpenseReply,
  buildDraftReplies,
  buildHelpReply,
  commandButtons,
  withCommandButtons,
  buildNewPaymentMethodReply,
  formatMonthlyTotals,
  formatAiUsage,
  formatRecent,
  toNewPaymentMethodName,
} from './conversation.messages'
import { AlbumItem, BotActionPayload, BotReply, ChannelMessage, ConversationResult } from './dto/conversation.types'

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

// Overlapping screenshots are compared against what was registered in this window (P21)
const DUPLICATE_LOOKBACK_DAYS = 60

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
    private readonly storedFilesService: StoredFilesService,
    private readonly debtsService: DebtsService,
    private readonly recognitionService: RecognitionService,
  ) {}

  async handle(message: ChannelMessage): Promise<ConversationResult> {
    const result = await this.route(message)
    return { ...result, replies: result.replies.map(withCommandButtons) }
  }

  private async route(message: ChannelMessage): Promise<ConversationResult> {
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

    // "dany me pagó 150": a payment towards what that person owes, read without the AI (P17)
    const payment = await this.proposeDebtPayment(text)
    if (payment) return [payment]

    return this.registerNewExpenses(message, text)
  }

  // Only when the person has something open in that direction; otherwise the text is a new expense
  private async proposeDebtPayment(text: string): Promise<BotReply | null> {
    const intent = parseDebtPayment(text, await this.expenseExtractionService.loadCatalog())
    if (!intent) return null

    const proposal = await this.debtsService.proposePayment(intent.personId, intent.direction, intent.amount)
    return proposal ? buildPaymentProposalReply(proposal) : null
  }

  // ✅ Confirmar · ✏️ Elegir cuota · ❌ Cancelar of a debt payment; the batch id travels as draftId
  private async handleDebtPaymentAction({
    name,
    draftId: batchId,
    value,
  }: BotActionPayload): Promise<ConversationResult> {
    const expired = { replies: [], notice: DEBT_TEXTS.paymentExpired }

    switch (name) {
      case BotAction.PAY_CONFIRM: {
        const updated = await this.debtsService.confirmPayment(batchId)
        return updated ? { replies: [buildPaymentSavedReply(updated)], notice: TEXTS.saved } : expired
      }
      case BotAction.PAY_LIST: {
        const proposal = await this.debtsService.findProposal(batchId)
        if (!proposal) return expired
        const open = await this.debtsService.findOpen(proposal.personId, proposal.direction)
        return { replies: [buildInstallmentPickerReply(batchId, open)] }
      }
      case BotAction.PAY_PICK: {
        const proposal = value ? await this.debtsService.pickInstallment(batchId, value) : null
        return proposal ? { replies: [buildPaymentProposalReply(proposal, true)] } : expired
      }
      default:
        await this.debtsService.cancelPayment(batchId)
        return { replies: [{ text: DEBT_TEXTS.paymentCancelled, edit: true }] }
    }
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
  // Screenshots share a batch: an album, or one image with several movements, is answered with one list (P21)
  private async handleMedia(message: ChannelMessage): Promise<BotReply[]> {
    if (message.type === ChannelMessageType.AUDIO) return this.receiveMedia(message)

    const batchId = randomUUID()
    const items: AlbumItem[] = message.album?.length
      ? message.album
      : message.media
        ? [{ messageId: message.messageId, media: message.media, text: message.text }]
        : []
    const replies: BotReply[] = []
    for (const { messageId, media, text } of items) {
      replies.push(...(await this.receiveMedia({ ...message, messageId, media, text, album: undefined }, batchId)))
    }
    return this.asList(message.chatId, batchId, replies)
  }

  // Two or more open expenses → one list; the replies without buttons (failures, cuadre, repeated images) stay
  private async asList(chatId: string, batchId: string, replies: BotReply[]): Promise<BotReply[]> {
    const expenseDrafts = await this.expenseDraftDBRepository.findOpenByBatch(chatId, batchId)
    if (expenseDrafts.length < 2) return replies

    const catalog = await this.expenseExtractionService.loadCatalog()
    const warnings = await Promise.all(expenseDrafts.map((expenseDraft) => this.duplicateWarning(expenseDraft)))
    return [
      ...replies.filter((reply) => !reply.buttons?.length),
      buildBatchReply(batchId, expenseDrafts, warnings, catalog),
    ]
  }

  private async receiveMedia(message: ChannelMessage, batchId?: string): Promise<BotReply[]> {
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
        batchId: batchId ?? null,
        inputType: isAudio ? ExpenseDraftInputType.AUDIO : ExpenseDraftInputType.IMAGE,
        // Audio: rawText is filled with the transcription
        rawText: isAudio ? null : message.text?.trim() || null,
        mediaFileId: media.fileId,
        mediaUniqueId: media.uniqueId,
        fileId: media.storedFileId ?? null,
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
    let expenses: ResolvedExpense[] = []
    let text = expenseDraft.rawText ?? undefined
    let documentType: string | null = null
    let summary: Extract<RecognitionResult, { screen: RecognizedScreen.IO_CATEGORY_SUMMARY }> | null = null
    const isAudio = expenseDraft.inputType === ExpenseDraftInputType.AUDIO

    try {
      if (isAudio && !text) {
        text = await this.transcribe(expenseDraft)
        if (!text) {
          await this.expenseDraftDBRepository.update(expenseDraft.id, { status: ExpenseDraftStatus.DISCARDED })
          return [{ text: TEXTS.emptyAudio, edit }]
        }
      }

      if (expenseDraft.inputType === ExpenseDraftInputType.IMAGE && expenseDraft.mediaFileId) {
        // Hybrid (D47, D63): the local templates first; Yape, lists and anything unsure go to the AI
        const image = await this.download(expenseDraft)
        const recognized = await this.recognitionService.recognize(image, expenseDraft.id)
        if (recognized?.screen === RecognizedScreen.IO_CATEGORY_SUMMARY) {
          summary = recognized
        } else if (recognized) {
          documentType = recognized.screen
          expenses = this.recognitionService.toExpenses(
            recognized.expenses,
            await this.expenseExtractionService.loadCatalog(),
          )
        } else {
          ;({ expenses } = await this.expenseExtractionService.extract({
            text,
            images: [image],
            draftId: expenseDraft.id,
          }))
        }
      } else {
        ;({ expenses } = await this.expenseExtractionService.extract({ text, draftId: expenseDraft.id }))
      }
    } catch (error) {
      this.logger.warn(`[extractInto] extraction failed: ${(error as Error).message}`)
      await this.expenseDraftDBRepository.update(expenseDraft.id, { status: ExpenseDraftStatus.FAILED })
      return [{ text: error instanceof StoredFileExpiredException ? TEXTS.fileExpired : TEXTS.failed, edit }]
    }

    // A summary by category has no expenses: it answers how the month of the card adds up
    if (summary) return this.replyReconciliation(expenseDraft, summary, edit)

    // Voice notes show what was understood, so a wrong transcription is easy to spot
    const heard = isAudio && text ? `${TEXTS.heard(text)}\n\n` : ''

    if (!expenses.length) {
      await this.expenseDraftDBRepository.update(expenseDraft.id, { status: ExpenseDraftStatus.DISCARDED })
      return [{ text: `${heard}${TEXTS.notAnExpense}`, edit }]
    }

    const catalog = await this.expenseExtractionService.loadCatalog()
    const replies: BotReply[] = []
    // Card screenshots without a visible card are the primary card (D47)
    if (expenseDraft.inputType === ExpenseDraftInputType.IMAGE) {
      expenses = expenses.map((expense) => withPrimaryCard(expense, catalog))
    }

    for (const [index, expense] of expenses.entries()) {
      const target =
        index === 0
          ? expenseDraft
          : await this.expenseDraftDBRepository.create({
              channel: expenseDraft.channel,
              chatId: expenseDraft.chatId,
              messageId: expenseDraft.messageId,
              itemIndex: expenseDraft.itemIndex + index,
              batchId: expenseDraft.batchId,
              inputType: expenseDraft.inputType,
              rawText: text ?? null,
              mediaFileId: expenseDraft.mediaFileId,
              fileId: expenseDraft.fileId,
            })

      const updated = await this.expenseDraftDBRepository.update(target.id, {
        ...toExpenseDraftUpdate(expense),
        ...(documentType ? { documentType } : {}),
      })
      const reply = await this.withDuplicateWarning(updated, this.replyFor(updated, catalog, edit && index === 0))
      replies.push(index === 0 && heard ? { ...reply, text: `${heard}${reply.text}` } : reply)
    }

    return replies
  }

  private async replyReconciliation(
    expenseDraft: ExpenseDraftDbDto,
    summary: Extract<RecognitionResult, { screen: RecognizedScreen.IO_CATEGORY_SUMMARY }>,
    edit: boolean,
  ): Promise<BotReply[]> {
    await this.expenseDraftDBRepository.update(expenseDraft.id, {
      status: ExpenseDraftStatus.DISCARDED,
      documentType: summary.screen,
    })
    const reconciliation = await this.recognitionService.reconcile(
      summary,
      await this.expenseExtractionService.loadCatalog(),
    )
    return [{ text: reconciliation ? formatReconciliation(reconciliation) : TEXTS.notAnExpense, edit }]
  }

  // From R2 when the file is already stored (D58); otherwise from the channel the first time, and kept in R2 for 7 days
  // so retries and kogane-app use that copy. A storage failure only logs: the extraction goes on with the bytes.
  private async download(expenseDraft: ExpenseDraftDbDto): Promise<MediaFile> {
    if (expenseDraft.fileId) return this.storedFilesService.download(expenseDraft.fileId)
    if (!expenseDraft.mediaFileId) throw new Error('The expense draft has no media file')

    const media = await this.mediaDownloaderRegistry.download(
      expenseDraft.channel as ExpenseDraftChannel,
      expenseDraft.mediaFileId,
    )
    try {
      const file = await this.storedFilesService.storeTemporary(
        expenseDraft.channel,
        Buffer.from(media.data, 'base64'),
        media.mimeType,
      )
      await this.expenseDraftDBRepository.update(expenseDraft.id, { fileId: file.id })
      expenseDraft.fileId = file.id
    } catch (error) {
      this.logger.warn(`[download] file not stored: ${(error as Error).message}`)
    }
    return media
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

  // ✅ Guardar todos saves the complete ones and leaves repeated or incomplete ones in Borrador; 📝 Revisar uno por
  // uno shows each summary; 📝 Borrador parks them all
  private async handleBatchAction(
    chatId: string,
    { name, draftId: batchId }: BotActionPayload,
  ): Promise<ConversationResult> {
    const expenseDrafts = await this.expenseDraftDBRepository.findOpenByBatch(chatId, batchId)
    if (!expenseDrafts.length) return { replies: [], notice: TEXTS.alreadyProcessed }

    const catalog = await this.expenseExtractionService.loadCatalog()
    const park = (id: string) =>
      this.expenseDraftDBRepository.update(id, { status: ExpenseDraftStatus.PENDING_REVIEW, pendingField: null })

    switch (name) {
      case BotAction.SAVE_ALL: {
        let saved = 0
        for (const expenseDraft of expenseDrafts) {
          const complete = !expenseDraft.missingFields.length && !(await this.duplicateWarning(expenseDraft))
          try {
            if (!complete) throw new Error('repeated or incomplete')
            await this.expenseSaverService.save(expenseDraft)
            saved++
          } catch (error) {
            if (complete) this.logger.warn(`[handleBatchAction] save failed: ${(error as Error).message}`)
            await park(expenseDraft.id)
          }
        }
        const parked = expenseDrafts.length - saved
        return {
          replies: [
            { text: `✅ <b>Lista procesada</b>: ${saved} guardados, ${parked} en borrador.`, edit: true },
            { text: TEXTS.batchSaved(saved, parked) },
          ],
          notice: TEXTS.saved,
        }
      }
      case BotAction.REVIEW_ALL: {
        const replies: BotReply[] = [{ text: TEXTS.batchReview, edit: true }]
        for (const expenseDraft of expenseDrafts) {
          replies.push(await this.withDuplicateWarning(expenseDraft, this.replyFor(expenseDraft, catalog)))
        }
        return { replies }
      }
      default: {
        for (const expenseDraft of expenseDrafts) await park(expenseDraft.id)
        return {
          replies: [
            { text: `📝 <b>En borrador</b>: ${expenseDrafts.length} gastos.`, edit: true },
            { text: TEXTS.batchParked(expenseDrafts.length) },
          ],
        }
      }
    }
  }

  private async handleAction(message: ChannelMessage): Promise<ConversationResult> {
    const action = message.action as BotActionPayload
    // Help buttons: run the command as if it was typed (draftId carries the command name)
    if (action.name === BotAction.COMMAND) {
      const command = action.draftId
      if (!(Object.values(BotCommand) as string[]).includes(command)) return { replies: [] }
      const replies = await this.handleCommand({
        ...message,
        type: ChannelMessageType.COMMAND,
        command,
        text: `/${command}`,
      })
      return { replies }
    }
    if (DEBT_PAYMENT_ACTIONS.includes(action.name)) return this.handleDebtPaymentAction(action)
    if (BATCH_ACTIONS.includes(action.name)) return this.handleBatchAction(message.chatId, action)

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
        return {
          replies: [buildClosedReply(`✅ <b>Guardado en ${label}</b>`, saved, catalog), buildSavedNotice(saved, label)],
          notice: TEXTS.saved,
        }
      }
      case BotAction.EDIT:
        await this.expenseDraftDBRepository.update(expenseDraft.id, { pendingField: FREE_CORRECTION_FIELD })
        return { replies: [{ text: TEXTS.askCorrection }] }
      case BotAction.LATER: {
        const updated = await this.expenseDraftDBRepository.update(expenseDraft.id, {
          status: ExpenseDraftStatus.PENDING_REVIEW,
          pendingField: null,
        })
        return { replies: [buildClosedReply('📝 <b>En borrador</b>', updated, catalog), buildParkedNotice(updated)] }
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
        const [usage, ocr] = await Promise.all([
          this.expenseExtractionService.getUsage(),
          this.recognitionService.todayStats(),
        ])
        return [{ text: formatAiUsage(usage, ocr) }]
      }
      case BotCommand.RECENT: {
        const recent = await this.expenseDraftDBRepository.findRecentSaved(
          message.channel,
          message.chatId,
          RECENT_EXPENSES_LIMIT,
        )
        return [{ text: formatRecent(recent), buttons: commandButtons(BotCommand.SUMMARY, BotCommand.DRAFTS) }]
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
        return [
          {
            text: formatMonthlyTotals(totals, catalog, `${MONTH_NAMES[month - 1]} ${year}`),
            buttons: commandButtons(BotCommand.RECENT, BotCommand.DRAFTS),
          },
        ]
      }
      case BotCommand.DEBTS:
        return [{ text: await this.debtsCommand(this.commandArgs(message)) }]
      case BotCommand.COLLECT:
        return [{ text: await this.collectCommand(this.commandArgs(message)) }]
      default:
        return [buildHelpReply()]
    }
  }

  // "/deudas dany" -> "dany" (channels keep the full text of commands)
  private commandArgs(message: ChannelMessage): string {
    return (message.text ?? '').trim().split(/\s+/).slice(1).join(' ')
  }

  // /deudas: everyone; /deudas dany: that person, installment by installment
  private async debtsCommand(args: string): Promise<string> {
    if (!args) return formatDebtSummary(await this.debtsService.summary())

    const person = matchCatalogEntry(await this.expenseExtractionService.loadCatalog(), CatalogKind.PERSON, args)
    if (!person) return DEBT_TEXTS.unknownPerson(args)
    return formatPersonDebts(person.name, await this.debtsService.findOpen(person.id))
  }

  // /cobrar dany: what Danery owes, as a message to forward
  private async collectCommand(args: string): Promise<string> {
    if (!args) return DEBT_TEXTS.collectUsage

    const person = matchCatalogEntry(await this.expenseExtractionService.loadCatalog(), CatalogKind.PERSON, args)
    if (!person) return DEBT_TEXTS.unknownPerson(args)
    return formatCollectMessage(person.name, await this.debtsService.findOpen(person.id, DebtDirection.OWED_TO_ME))
  }

  // Same receipt (operation number) or, without one, the same card + day + amount + merchant of an overlapping
  // screenshot in the last 60 days (P21). Only a warning: the user decides.
  private async withDuplicateWarning(expenseDraft: ExpenseDraftDbDto, reply: BotReply): Promise<BotReply> {
    const warning = await this.duplicateWarning(expenseDraft)
    return warning ? { ...reply, text: `${warning}\n\n${reply.text}` } : reply
  }

  private async duplicateWarning(expenseDraft: ExpenseDraftDbDto): Promise<string | null> {
    const { id, operationNumber, paymentMethodId, amount, spentAt } = expenseDraft
    if (operationNumber) {
      const duplicated = await this.expenseDraftDBRepository.existsSavedWithOperationNumber(operationNumber, id)
      return duplicated ? TEXTS.possibleDuplicate(operationNumber) : null
    }
    if (!paymentMethodId || amount == null || !spentAt) return null

    const since = new Date(Date.now() - DUPLICATE_LOOKBACK_DAYS * 24 * 60 * 60_000)
    const candidates = await this.expenseDraftDBRepository.findSameCardDayAmount(
      { id, paymentMethodId, amount, spentAt },
      since,
    )
    const concept = expenseDraft.merchant ?? expenseDraft.description
    const match = candidates.find((candidate) => sameMerchant(candidate.merchant ?? candidate.description, concept))
    if (!match) return null
    return TEXTS.possibleRepeat(
      match.merchant ?? match.description ?? '',
      formatAmount(amount, expenseDraft.currency),
      spentAt.toISOString().slice(0, 10).split('-').reverse().join('/'),
    )
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
